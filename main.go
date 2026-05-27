package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	_ "modernc.org/sqlite"
)

func normalizeBarcodeInput(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}

	var mapped []rune
	for _, r := range trimmed {
		switch {
		case r == '\u3000':
			mapped = append(mapped, ' ')
		case r >= '！' && r <= '～':
			mapped = append(mapped, r-0xFEE0)
		default:
			mapped = append(mapped, r)
		}
	}

	return strings.TrimSpace(string(mapped))
}

// New schema types
type CategoryDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type MakerDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type DepartmentDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type StaffDTO struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	BusyoID string `json:"busyo_id"`
}

type ProductDTO struct {
	ProductCD    string `json:"product_cd"`
	ProductName  string `json:"product_name"`
	CategoryID   string `json:"category_id"`
	CategoryName string `json:"category_name"`
	MakerID      string `json:"maker_id"`
	MakerName    string `json:"maker_name"`
	ModelNumber  string `json:"model_number"`
	ProductInfo  string `json:"product_info"`
	Remarks      string `json:"remarks"`
}

type InventoryItemDTO struct {
	Product       ProductDTO `json:"product"`
	StockQuantity int        `json:"stock_quantity"`
	CreatedAt     string     `json:"created_at"`
	UpdatedAt     string     `json:"updated_at"`
}

func resolveEventByAction(action string) (eventID string, eventName string, delta int, err error) {
	switch action {
	case "in":
		eventName = "入庫"
		delta = 1
	case "out":
		eventName = "出庫"
		delta = -1
	case "dispose":
		eventName = "廃棄"
		delta = -1
	default:
		return "", "", 0, sql.ErrNoRows
	}

	err = db.QueryRow("SELECT id FROM event_master WHERE name = ?", eventName).Scan(&eventID)
	if err != nil {
		return "", "", 0, err
	}

	return eventID, eventName, delta, nil
}

var db *sql.DB

func initDB(dbPath string) {
	var err error
	db, err = sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}

	// Test connection
	if err := db.Ping(); err != nil {
		log.Fatal(err)
	}

	// Enable foreign keys
	_, _ = db.Exec("PRAGMA foreign_keys = ON")

	if err := ensureProductsBarcodeUniqueness(db); err != nil {
		log.Fatal(err)
	}

	if err := ensureStockLogSchema(db); err != nil {
		log.Fatal(err)
	}
}

func ensureProductsBarcodeUniqueness(db *sql.DB) error {
	rows, err := db.Query(`
		SELECT COALESCE(product_cd, '')
		FROM products
		WHERE COALESCE(product_cd, '') <> ''
		GROUP BY product_cd
		HAVING COUNT(1) > 1
		ORDER BY product_cd
		LIMIT 5
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	var duplicated []string
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			return err
		}
		duplicated = append(duplicated, code)
	}

	if len(duplicated) > 0 {
		return fmt.Errorf("products.product_cd has duplicates; resolve before startup (examples: %s)", strings.Join(duplicated, ", "))
	}

	_, err = db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS ux_products_product_cd
		ON products(product_cd)
		WHERE COALESCE(product_cd, '') <> ''
	`)
	return err
}

func ensureStockLogSchema(db *sql.DB) error {
	var exists int
	err := db.QueryRow("SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='stock_log'").Scan(&exists)
	if err != nil {
		return err
	}

	if exists == 0 {
		_, err = db.Exec(`
			CREATE TABLE stock_log (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				created_at TIMESTAMP DEFAULT (DATETIME('now', '+9 hours')),
				product_cd CHAR(13),
				busyo_id CHAR(2),
				kean_id VARCHAR(20),
				event_id CHAR(2),
				quantity INTEGER NOT NULL DEFAULT 1,
				FOREIGN KEY (product_cd) REFERENCES products(product_cd),
				FOREIGN KEY (busyo_id) REFERENCES booking_busyo(busyo_cd),
				FOREIGN KEY (kean_id) REFERENCES booking_keanid(alias),
				FOREIGN KEY (event_id) REFERENCES event_master(id)
			)
		`)
		return err
	}

	rows, err := db.Query("PRAGMA table_info('stock_log')")
	if err != nil {
		return err
	}
	defer rows.Close()

	hasQuantity := false
	hasRequestID := false
	idIsIntegerPK := false
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dflt sql.NullString
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if strings.EqualFold(name, "quantity") {
			hasQuantity = true
		}
		if strings.EqualFold(name, "request_id") {
			hasRequestID = true
		}
		if strings.EqualFold(name, "id") && pk == 1 {
			upperType := strings.ToUpper(strings.TrimSpace(ctype))
			if strings.Contains(upperType, "INT") {
				idIsIntegerPK = true
			}
		}
	}

	if hasQuantity && idIsIntegerPK {
		if !hasRequestID {
			if _, err := db.Exec("ALTER TABLE stock_log ADD COLUMN request_id TEXT"); err != nil {
				return err
			}
		}
		_, err := db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_log_request_id ON stock_log(request_id) WHERE request_id IS NOT NULL")
		return err
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	if _, err := tx.Exec("PRAGMA foreign_keys = OFF"); err != nil {
		return err
	}

	if _, err := tx.Exec("ALTER TABLE stock_log RENAME TO stock_log_old"); err != nil {
		return err
	}

	if _, err := tx.Exec(`
		CREATE TABLE stock_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			created_at TIMESTAMP DEFAULT (DATETIME('now', '+9 hours')),
			product_cd CHAR(13),
			busyo_id CHAR(2),
			kean_id VARCHAR(20),
			event_id CHAR(2),
			quantity INTEGER NOT NULL DEFAULT 1,
			request_id TEXT,
			FOREIGN KEY (product_cd) REFERENCES products(product_cd),
			FOREIGN KEY (busyo_id) REFERENCES booking_busyo(busyo_cd),
			FOREIGN KEY (kean_id) REFERENCES booking_keanid(alias),
			FOREIGN KEY (event_id) REFERENCES event_master(id)
		)
	`); err != nil {
		return err
	}

	insertSQL := `
		INSERT INTO stock_log (created_at, product_cd, busyo_id, kean_id, event_id, quantity, request_id)
		SELECT created_at, product_cd, busyo_id, kean_id, event_id, 1, NULL
		FROM stock_log_old
		ORDER BY created_at, rowid
	`
	if hasQuantity {
		insertSQL = `
			INSERT INTO stock_log (created_at, product_cd, busyo_id, kean_id, event_id, quantity, request_id)
			SELECT created_at, product_cd, busyo_id, kean_id, event_id, COALESCE(quantity, 1), NULL
			FROM stock_log_old
			ORDER BY created_at, rowid
		`
	}

	if _, err := tx.Exec(insertSQL); err != nil {
		return fmt.Errorf("stock_log data migration failed: %w", err)
	}

	if _, err := tx.Exec("DROP TABLE stock_log_old"); err != nil {
		return err
	}

	if _, err := tx.Exec("CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_log_request_id ON stock_log(request_id) WHERE request_id IS NOT NULL"); err != nil {
		return err
	}

	if _, err := tx.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return err
	}

	return tx.Commit()
}

func main() {
	exePath, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}
	baseDir := filepath.Dir(exePath)
	if _, err := os.Stat(filepath.Join(baseDir, "index.html")); err != nil {
		wd, wdErr := os.Getwd()
		if wdErr != nil {
			log.Fatal(wdErr)
		}
		baseDir = wd
	}

	// Run as a local "tablet app" by default - use DebugMode to see route errors
	gin.SetMode(gin.DebugMode)

	// Use inventory.db as the default local DB
	initDB(filepath.Join(baseDir, "inventory.db"))
	defer db.Close()

	r := gin.Default()
	_ = r.SetTrustedProxies([]string{"127.0.0.1", "::1"})

	// Serve static files
	r.Static("/static", baseDir)
	r.StaticFile("/manifest.webmanifest", filepath.Join(baseDir, "manifest.webmanifest"))
	r.StaticFile("/sw.js", filepath.Join(baseDir, "sw.js"))
	r.StaticFile("/index.html", filepath.Join(baseDir, "index.html"))

	// New hierarchical API routes
	r.GET("/api/categories", getCategories)
	r.GET("/api/makers", getMakers)
	r.GET("/api/departments", getDepartments)
	r.GET("/api/staffs", getStaffs)
	r.GET("/api/products", getProductsFiltered)
	r.GET("/api/inventory", getInventory)
	r.POST("/api/inventory/update", updateInventory)
	r.POST("/api/barcode/search", searchByBarcode)

	// Avoid noisy 404 in browsers.
	r.GET("/favicon.ico", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	// Serve index.html
	r.GET("/", func(c *gin.Context) {
		c.File(filepath.Join(baseDir, "index.html"))
	})

	log.Println("Server starting on http://localhost:8080")
	r.Run(":8080")
}

// getCategories returns all product categories
func getCategories(c *gin.Context) {
	rows, err := db.Query(`
		SELECT id, name FROM product_category 
		ORDER BY id
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var categories []CategoryDTO
	for rows.Next() {
		var cat CategoryDTO
		if err := rows.Scan(&cat.ID, &cat.Name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		categories = append(categories, cat)
	}
	c.JSON(http.StatusOK, categories)
}

// getMakers returns makers filtered by category_id (optional)
func getMakers(c *gin.Context) {
	categoryID := c.Query("category_id")

	var rows *sql.Rows
	var err error

	if categoryID != "" {
		rows, err = db.Query(`
			SELECT DISTINCT m.id, m.name 
			FROM maker m
			INNER JOIN products p ON p.maker_id = m.id
			WHERE p.category_id = ?
			ORDER BY m.id
		`, categoryID)
	} else {
		rows, err = db.Query(`
			SELECT id, name FROM maker 
			ORDER BY id
		`)
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var makers []MakerDTO
	for rows.Next() {
		var maker MakerDTO
		if err := rows.Scan(&maker.ID, &maker.Name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		makers = append(makers, maker)
	}
	c.JSON(http.StatusOK, makers)
}

// getDepartments returns department master list
func getDepartments(c *gin.Context) {
	rows, err := db.Query(`
		SELECT COALESCE(busyo_cd, ''), COALESCE(name, '')
		FROM booking_busyo
		ORDER BY busyo_cd
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var departments []DepartmentDTO
	for rows.Next() {
		var d DepartmentDTO
		if err := rows.Scan(&d.ID, &d.Name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		departments = append(departments, d)
	}

	c.JSON(http.StatusOK, departments)
}

// getStaffs returns staff master list
func getStaffs(c *gin.Context) {
	departmentID := c.Query("department_id")

	var rows *sql.Rows
	var err error

	if departmentID != "" {
		rows, err = db.Query(`
			SELECT DISTINCT COALESCE(k.alias, ''), COALESCE(k.name, ''), COALESCE(k.busyo_id, '')
			FROM booking_keanid k
			INNER JOIN booking_busyo b ON b.busyo_cd = k.busyo_id
			WHERE COALESCE(k.alias, '') <> ''
			  AND b.busyo_cd = ?
			ORDER BY alias
		`, departmentID)
	} else {
		rows, err = db.Query(`
			SELECT DISTINCT COALESCE(k.alias, ''), COALESCE(k.name, ''), COALESCE(k.busyo_id, '')
			FROM booking_keanid k
			INNER JOIN booking_busyo b ON b.busyo_cd = k.busyo_id
			WHERE COALESCE(k.alias, '') <> ''
			ORDER BY alias
		`)
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var staffs []StaffDTO
	for rows.Next() {
		var s StaffDTO
		if err := rows.Scan(&s.ID, &s.Name, &s.BusyoID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		staffs = append(staffs, s)
	}

	c.JSON(http.StatusOK, staffs)
}

// getProductsFiltered returns products filtered by category_id and/or maker_id
func getProductsFiltered(c *gin.Context) {
	categoryID := c.Query("category_id")
	makerID := c.Query("maker_id")

	query := `
		SELECT 
			p.product_cd,
			COALESCE(p.product_name, ''),
			COALESCE(p.category_id, ''),
			COALESCE(pc.name, ''),
			COALESCE(p.maker_id, ''),
			COALESCE(m.name, ''),
			COALESCE(p.model_number, ''),
			COALESCE(p.product_info, ''),
			COALESCE(p.remarks, '')
		FROM products p
		LEFT JOIN product_category pc ON p.category_id = pc.id
		LEFT JOIN maker m ON p.maker_id = m.id
		WHERE 1=1
	`

	args := []interface{}{}

	if categoryID != "" {
		query += " AND p.category_id = ?"
		args = append(args, categoryID)
	}

	if makerID != "" {
		query += " AND p.maker_id = ?"
		args = append(args, makerID)
	}

	query += " ORDER BY p.product_name"

	rows, err := db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var products []ProductDTO
	for rows.Next() {
		var p ProductDTO
		if err := rows.Scan(
			&p.ProductCD, &p.ProductName, &p.CategoryID, &p.CategoryName,
			&p.MakerID, &p.MakerName, &p.ModelNumber, &p.ProductInfo, &p.Remarks,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		products = append(products, p)
	}
	c.JSON(http.StatusOK, products)
}

// getInventory returns inventory items with product details
func getInventory(c *gin.Context) {
	categoryID := c.Query("category_id")
	makerID := c.Query("maker_id")

	query := `
		SELECT 
			p.product_cd,
			COALESCE(p.product_name, ''),
			COALESCE(p.category_id, ''),
			COALESCE(pc.name, ''),
			COALESCE(p.maker_id, ''),
			COALESCE(m.name, ''),
			COALESCE(p.model_number, ''),
			COALESCE(p.product_info, ''),
			COALESCE(p.remarks, ''),
			COALESCE(i.stock_quantity, 0), 
			COALESCE(i.created_at, ''), COALESCE(i.updated_at, '')
		FROM products p
		LEFT JOIN product_category pc ON p.category_id = pc.id
		LEFT JOIN maker m ON p.maker_id = m.id
		LEFT JOIN inventory i ON p.product_cd = i.product_cd
		WHERE 1=1
	`

	args := []interface{}{}

	if categoryID != "" {
		query += " AND p.category_id = ?"
		args = append(args, categoryID)
	}

	if makerID != "" {
		query += " AND p.maker_id = ?"
		args = append(args, makerID)
	}

	query += " ORDER BY p.product_name"

	rows, err := db.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var inventory []InventoryItemDTO
	for rows.Next() {
		var item InventoryItemDTO
		if err := rows.Scan(
			&item.Product.ProductCD, &item.Product.ProductName,
			&item.Product.CategoryID, &item.Product.CategoryName,
			&item.Product.MakerID, &item.Product.MakerName,
			&item.Product.ModelNumber, &item.Product.ProductInfo, &item.Product.Remarks,
			&item.StockQuantity, &item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		inventory = append(inventory, item)
	}
	c.JSON(http.StatusOK, inventory)
}

// updateInventory updates stock quantity
func updateInventory(c *gin.Context) {
	var req struct {
		ProductCD    string `json:"product_cd"`
		Action       string `json:"action"` // "in", "out" or "dispose"
		Quantity     int    `json:"quantity"`
		DepartmentID string `json:"department_id"`
		StaffID      string `json:"staff_id"`
		RequestID    string `json:"request_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.ProductCD == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "product_cd is required"})
		return
	}
	if req.Quantity <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "quantity must be greater than zero"})
		return
	}
	if req.DepartmentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "department_id is required"})
		return
	}

	eventID, eventName, delta, eventErr := resolveEventByAction(req.Action)
	if eventErr == sql.ErrNoRows {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid action"})
		return
	}
	if eventErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "event_master lookup failed"})
		return
	}

	var departmentCount int
	err := db.QueryRow("SELECT COUNT(1) FROM booking_busyo WHERE busyo_cd = ?", req.DepartmentID).Scan(&departmentCount)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if departmentCount == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid department_id"})
		return
	}

	if req.StaffID != "" {
		var staffCount int
		err = db.QueryRow(
			`SELECT COUNT(1)
			 FROM booking_keanid k
			 INNER JOIN booking_busyo b ON b.busyo_cd = k.busyo_id
			 WHERE k.alias = ? AND b.busyo_cd = ?`,
			req.StaffID,
			req.DepartmentID,
		).Scan(&staffCount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if staffCount == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "staff_id does not belong to department_id"})
			return
		}
	}

	tx, err := db.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer func() {
		_ = tx.Rollback()
	}()

	if req.RequestID != "" {
		var reqDupCount int
		err = tx.QueryRow("SELECT COUNT(1) FROM stock_log WHERE request_id = ?", req.RequestID).Scan(&reqDupCount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if reqDupCount > 0 {
			c.JSON(http.StatusOK, gin.H{
				"message":       "Duplicate request ignored",
				"event_id":      eventID,
				"event_name":    eventName,
				"department_id": req.DepartmentID,
				"staff_id":      req.StaffID,
			})
			return
		}
	}

	var productExists int
	err = tx.QueryRow("SELECT COUNT(1) FROM products WHERE product_cd = ?", req.ProductCD).Scan(&productExists)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if productExists == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid product_cd"})
		return
	}

	var currentQty int
	err = tx.QueryRow("SELECT COALESCE(stock_quantity, 0) FROM inventory WHERE product_cd = ?", req.ProductCD).Scan(&currentQty)
	if err != nil && err != sql.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	newQty := currentQty + (delta * req.Quantity)
	if newQty < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Insufficient stock"})
		return
	}

	var keanID interface{}
	if req.StaffID != "" {
		keanID = req.StaffID
	} else {
		keanID = nil
	}

	var requestID interface{}
	if req.RequestID != "" {
		requestID = req.RequestID
	} else {
		requestID = nil
	}

	stockLogRes, err := tx.Exec(`
		INSERT OR IGNORE INTO stock_log (product_cd, busyo_id, kean_id, event_id, quantity, request_id)
		VALUES (?, ?, ?, ?, ?, ?)
	`, req.ProductCD, req.DepartmentID, keanID, eventID, req.Quantity, requestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.RequestID != "" {
		affected, affErr := stockLogRes.RowsAffected()
		if affErr == nil && affected == 0 {
			c.JSON(http.StatusOK, gin.H{
				"message":       "Duplicate request ignored",
				"event_id":      eventID,
				"event_name":    eventName,
				"department_id": req.DepartmentID,
				"staff_id":      req.StaffID,
			})
			return
		}
	}

	// Insert or update inventory
	_, err = tx.Exec(`
		INSERT INTO inventory (product_cd, stock_quantity, created_at, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT(product_cd) DO UPDATE SET 
			stock_quantity = excluded.stock_quantity,
			updated_at = CURRENT_TIMESTAMP
	`, req.ProductCD, newQty)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":       "Inventory updated",
		"event_id":      eventID,
		"event_name":    eventName,
		"department_id": req.DepartmentID,
		"staff_id":      req.StaffID,
	})
}

// searchByBarcode searches product by barcode
func searchByBarcode(c *gin.Context) {
	var req struct {
		Barcode string `json:"barcode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	normalizedBarcode := normalizeBarcodeInput(req.Barcode)
	if normalizedBarcode == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Barcode is required"})
		return
	}

	var item InventoryItemDTO
	err := db.QueryRow(`
		SELECT 
			p.product_cd,
			COALESCE(p.product_name, ''),
			COALESCE(p.category_id, ''),
			COALESCE(pc.name, ''),
			COALESCE(p.maker_id, ''),
			COALESCE(m.name, ''),
			COALESCE(p.model_number, ''),
			COALESCE(p.product_info, ''),
			COALESCE(p.remarks, ''),
			COALESCE(i.stock_quantity, 0), 
			COALESCE(i.created_at, ''), COALESCE(i.updated_at, '')
		FROM products p
		LEFT JOIN product_category pc ON p.category_id = pc.id
		LEFT JOIN maker m ON p.maker_id = m.id
		LEFT JOIN inventory i ON p.product_cd = i.product_cd
		WHERE p.product_cd = ?
	`, normalizedBarcode).Scan(
		&item.Product.ProductCD, &item.Product.ProductName,
		&item.Product.CategoryID, &item.Product.CategoryName,
		&item.Product.MakerID, &item.Product.MakerName,
		&item.Product.ModelNumber, &item.Product.ProductInfo, &item.Product.Remarks,
		&item.StockQuantity, &item.CreatedAt, &item.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, item)
}
