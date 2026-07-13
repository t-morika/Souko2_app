package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/url"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	_ "github.com/jackc/pgx/v5/stdlib"
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

type StatusDTO struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type ProductDTO struct {
	ProductCD    string `json:"product_cd"`
	ProductName  string `json:"product_name"`
	CategoryID   string `json:"category_id"`
	CategoryName string `json:"category_name"`
	MakerID      string `json:"maker_id"`
	MakerName    string `json:"maker_name"`
	StatusID     string `json:"status_id"`
	StatusName   string `json:"status_name"`
	ModelNumber  string `json:"model_number"`
	ProductInfo  string `json:"product_info"`
	Remarks      string `json:"remarks"`
}

type InventoryItemDTO struct {
	Product            ProductDTO `json:"product"`
	LoanDepartmentID   string     `json:"loan_department_id"`
	LoanDepartmentName string     `json:"loan_department_name"`
	LoanStaffID        string     `json:"loan_staff_id"`
	LoanStaffName      string     `json:"loan_staff_name"`
	StockQuantity      int        `json:"stock_quantity"`
	IsDisposed         bool       `json:"is_disposed"`
	CreatedAt          string     `json:"created_at"`
	UpdatedAt          string     `json:"updated_at"`
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
	case "purchase":
		delta = 1
		err = db.QueryRow("SELECT id, name FROM event_master WHERE id = ?", "04").Scan(&eventID, &eventName)
		if err != nil {
			return "", "", 0, err
		}
		return eventID, eventName, delta, nil
	default:
		return "", "", 0, sql.ErrNoRows
	}

	err = db.QueryRow("SELECT id FROM event_master WHERE name = ?", eventName).Scan(&eventID)
	if err != nil {
		return "", "", 0, err
	}

	return eventID, eventName, delta, nil
}

var db *DB

type DB struct {
	*sql.DB
}

type Tx struct {
	*sql.Tx
}

func rebindQuestionToDollar(query string) string {
	var b strings.Builder
	b.Grow(len(query) + 8)

	argPos := 1
	inSingleQuote := false
	inDoubleQuote := false

	for i := 0; i < len(query); i++ {
		ch := query[i]

		if ch == '\'' && !inDoubleQuote {
			inSingleQuote = !inSingleQuote
			b.WriteByte(ch)
			continue
		}
		if ch == '"' && !inSingleQuote {
			inDoubleQuote = !inDoubleQuote
			b.WriteByte(ch)
			continue
		}

		if ch == '?' && !inSingleQuote && !inDoubleQuote {
			b.WriteString(fmt.Sprintf("$%d", argPos))
			argPos++
			continue
		}

		b.WriteByte(ch)
	}

	return b.String()
}

func (d *DB) Query(query string, args ...interface{}) (*sql.Rows, error) {
	return d.DB.Query(rebindQuestionToDollar(query), args...)
}

func (d *DB) QueryRow(query string, args ...interface{}) *sql.Row {
	return d.DB.QueryRow(rebindQuestionToDollar(query), args...)
}

func (d *DB) Exec(query string, args ...interface{}) (sql.Result, error) {
	return d.DB.Exec(rebindQuestionToDollar(query), args...)
}

func (d *DB) Begin() (*Tx, error) {
	tx, err := d.DB.Begin()
	if err != nil {
		return nil, err
	}
	return &Tx{Tx: tx}, nil
}

func (t *Tx) Query(query string, args ...interface{}) (*sql.Rows, error) {
	return t.Tx.Query(rebindQuestionToDollar(query), args...)
}

func (t *Tx) QueryRow(query string, args ...interface{}) *sql.Row {
	return t.Tx.QueryRow(rebindQuestionToDollar(query), args...)
}

func (t *Tx) Exec(query string, args ...interface{}) (sql.Result, error) {
	return t.Tx.Exec(rebindQuestionToDollar(query), args...)
}

type statusMasterColumns struct {
	ID   string
	Name string
}

func isSafeIdentifier(name string) bool {
	if name == "" {
		return false
	}
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			continue
		}
		return false
	}
	return true
}

func pickFirstExisting(candidates []string, columnMap map[string]string) string {
	for _, c := range candidates {
		if v, ok := columnMap[strings.ToLower(c)]; ok && isSafeIdentifier(v) {
			return v
		}
	}
	for _, v := range columnMap {
		if isSafeIdentifier(v) {
			return v
		}
	}
	return ""
}

func resolveStatusMasterColumns() (statusMasterColumns, error) {
	rows, err := db.Query(`
		SELECT column_name
		FROM information_schema.columns
		WHERE table_schema = current_schema()
		  AND table_name = 'status_master'
	`)
	if err != nil {
		return statusMasterColumns{}, err
	}
	defer rows.Close()

	columnMap := map[string]string{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return statusMasterColumns{}, err
		}
		columnMap[strings.ToLower(name)] = name
	}

	if len(columnMap) == 0 {
		return statusMasterColumns{}, fmt.Errorf("status_master has no columns")
	}

	idCol := pickFirstExisting([]string{"id", "status_id", "status_cd", "code", "cd"}, columnMap)
	nameCol := pickFirstExisting([]string{"name", "status_name", "status", "label"}, columnMap)
	if idCol == "" || nameCol == "" {
		return statusMasterColumns{}, fmt.Errorf("failed to resolve status_master columns")
	}

	return statusMasterColumns{ID: idCol, Name: nameCol}, nil
}

func initDB(dbPath string) {
	var err error
	raw, err := sql.Open("pgx", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	db = &DB{DB: raw}

	// Test connection
	if err := db.Ping(); err != nil {
		log.Fatal(err)
	}

	if err := ensureProductsBarcodeUniqueness(db); err != nil {
		log.Fatal(err)
	}

	if err := ensureStockLogSchema(db); err != nil {
		log.Fatal(err)
	}

	if err := ensureProductInfoLogSchema(db); err != nil {
		log.Fatal(err)
	}
}

func resolveDBPath(baseDir string) string {
	if dsn := strings.TrimSpace(os.Getenv("DATABASE_URL")); dsn != "" {
		return dsn
	}

	host := strings.TrimSpace(os.Getenv("DB_HOST"))
	if host == "" {
		host = "localhost"
	}

	port := strings.TrimSpace(os.Getenv("DB_PORT"))
	if port == "" {
		port = "5432"
	}

	user := strings.TrimSpace(os.Getenv("DB_USER"))
	if user == "" {
		user = "postgres"
	}

	password := strings.TrimSpace(os.Getenv("DB_PASSWORD"))
	if password == "" {
		password = "postgres"
	}

	name := strings.TrimSpace(os.Getenv("DB_NAME"))
	if name == "" {
		name = "inventory"
	}

	sslMode := strings.TrimSpace(os.Getenv("DB_SSLMODE"))
	if sslMode == "" {
		sslMode = "disable"
	}

	_ = baseDir
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		url.QueryEscape(user),
		url.QueryEscape(password),
		host,
		port,
		url.QueryEscape(name),
		url.QueryEscape(sslMode),
	)
}

func ensureProductsBarcodeUniqueness(db *DB) error {
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

func ensureStockLogSchema(db *DB) error {
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS stock_log (
			id BIGSERIAL PRIMARY KEY,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			product_cd CHAR(13),
			busyo_id CHAR(2),
			kean_id VARCHAR(20),
			event_id CHAR(2),
			quantity INTEGER NOT NULL DEFAULT 1,
			request_id TEXT,
			FOREIGN KEY (product_cd) REFERENCES products(product_cd),
			FOREIGN KEY (busyo_id) REFERENCES booking_busyo(busyo_cd),
			FOREIGN KEY (event_id) REFERENCES event_master(id)
		)
	`); err != nil {
		return err
	}

	if _, err := db.Exec(`ALTER TABLE stock_log ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1`); err != nil {
		return err
	}

	if _, err := db.Exec(`ALTER TABLE stock_log ADD COLUMN IF NOT EXISTS request_id TEXT`); err != nil {
		return err
	}

	if _, err := db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_log_request_id
		ON stock_log(request_id)
		WHERE request_id IS NOT NULL
	`); err != nil {
		return err
	}

	return nil
}

func ensureProductInfoLogSchema(db *DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS product_info_log (
			id BIGSERIAL PRIMARY KEY,
			created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
			product_cd CHAR(13) NOT NULL,
			old_product_info TEXT,
			new_product_info TEXT,
			request_id TEXT,
			FOREIGN KEY (product_cd) REFERENCES products(product_cd)
		)
	`)
	if err != nil {
		return err
	}

	_, err = db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS ux_product_info_log_request_id
		ON product_info_log(request_id)
		WHERE request_id IS NOT NULL
	`)
	return err
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

	// Use the shared inventory.db path, preferring environment-based overrides.
	initDB(resolveDBPath(baseDir))
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
	r.GET("/api/statuses", getStatuses)
	r.GET("/api/products", getProductsFiltered)
	r.POST("/api/products/info", updateProductInfo)
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
		// Get makers for a specific category
		rows, err = db.Query(`
			SELECT DISTINCT m.id, m.name 
			FROM maker m
			INNER JOIN products p ON p.maker_id = m.id
			WHERE p.category_id = ?
			ORDER BY m.id
		`, categoryID)
	} else {
		// Get all makers
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

// getStatuses returns status master list
func getStatuses(c *gin.Context) {
	cols, err := resolveStatusMasterColumns()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	query := fmt.Sprintf(`
		SELECT %s, %s FROM status_master
		ORDER BY %s
	`, cols.ID, cols.Name, cols.ID)
	rows, err := db.Query(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var statuses []StatusDTO
	for rows.Next() {
		var s StatusDTO
		if err := rows.Scan(&s.ID, &s.Name); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		statuses = append(statuses, s)
	}

	c.JSON(http.StatusOK, statuses)
}

// getProductsFiltered returns products filtered by category_id and/or maker_id
func getProductsFiltered(c *gin.Context) {
	categoryID := c.Query("category_id")
	makerID := c.Query("maker_id")
	statusCols, err := resolveStatusMasterColumns()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	query := fmt.Sprintf(`
		SELECT 
			p.product_cd,
			COALESCE(p.product_name, ''),
			COALESCE(p.category_id, ''),
			COALESCE(pc.name, ''),
			COALESCE(p.maker_id, ''),
			COALESCE(m.name, ''),
			COALESCE(p.status_id, ''),
			COALESCE(sm.%s, ''),
			COALESCE(p.model_number, ''),
			COALESCE(p.product_info, ''),
			COALESCE(p.remarks, '')
		FROM products p
		LEFT JOIN product_category pc ON p.category_id = pc.id
		LEFT JOIN maker m ON p.maker_id = m.id
		LEFT JOIN status_master sm ON p.status_id = sm.%s
		WHERE 1=1
	`, statusCols.Name, statusCols.ID)

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
			&p.MakerID, &p.MakerName, &p.StatusID, &p.StatusName,
			&p.ModelNumber, &p.ProductInfo, &p.Remarks,
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
	statusCols, err := resolveStatusMasterColumns()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	query := fmt.Sprintf(`
		SELECT 
			p.product_cd,
			COALESCE(p.product_name, ''),
			COALESCE(p.category_id, ''),
			COALESCE(pc.name, ''),
			COALESCE(p.maker_id, ''),
			COALESCE(m.name, ''),
			COALESCE(p.status_id, ''),
			COALESCE(sm.%s, ''),
			COALESCE(p.model_number, ''),
			COALESCE(p.product_info, ''),
			COALESCE(p.remarks, ''),
			COALESCE((
				SELECT sl.busyo_id
				FROM stock_log sl
				INNER JOIN event_master em ON em.id = sl.event_id
				WHERE sl.product_cd = p.product_cd
				  AND em.name = '出庫'
				ORDER BY sl.created_at DESC, sl.id DESC
				LIMIT 1
			), ''),
			COALESCE((
				SELECT b.name
				FROM stock_log sl
				INNER JOIN event_master em ON em.id = sl.event_id
				LEFT JOIN booking_busyo b ON b.busyo_cd = sl.busyo_id
				WHERE sl.product_cd = p.product_cd
				  AND em.name = '出庫'
				ORDER BY sl.created_at DESC, sl.id DESC
				LIMIT 1
			), ''),
			COALESCE((
				SELECT sl.kean_id
				FROM stock_log sl
				INNER JOIN event_master em ON em.id = sl.event_id
				WHERE sl.product_cd = p.product_cd
				  AND em.name = '出庫'
				ORDER BY sl.created_at DESC, sl.id DESC
				LIMIT 1
			), ''),
			COALESCE((
				SELECT k.name
				FROM stock_log sl
				INNER JOIN event_master em ON em.id = sl.event_id
				LEFT JOIN booking_keanid k ON k.alias = sl.kean_id
				WHERE sl.product_cd = p.product_cd
				  AND em.name = '出庫'
				ORDER BY sl.created_at DESC, sl.id DESC
				LIMIT 1
			), ''),
			COALESCE(i.stock_quantity, 0), 
			CASE WHEN EXISTS (
				SELECT 1
				FROM stock_log sl
				INNER JOIN event_master em ON em.id = sl.event_id
				WHERE sl.product_cd = p.product_cd
				  AND em.name = '廃棄'
			) THEN 1 ELSE 0 END,
			COALESCE(i.created_at::text, ''), COALESCE(i.updated_at::text, '')
		FROM products p
		LEFT JOIN product_category pc ON p.category_id = pc.id
		LEFT JOIN maker m ON p.maker_id = m.id
		LEFT JOIN status_master sm ON p.status_id = sm.%s
		LEFT JOIN inventory i ON p.product_cd = i.product_cd
		WHERE 1=1
	`, statusCols.Name, statusCols.ID)

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
		var disposedFlag int
		if err := rows.Scan(
			&item.Product.ProductCD, &item.Product.ProductName,
			&item.Product.CategoryID, &item.Product.CategoryName,
			&item.Product.MakerID, &item.Product.MakerName,
			&item.Product.StatusID, &item.Product.StatusName,
			&item.Product.ModelNumber, &item.Product.ProductInfo, &item.Product.Remarks,
			&item.LoanDepartmentID, &item.LoanDepartmentName,
			&item.LoanStaffID, &item.LoanStaffName,
			&item.StockQuantity, &disposedFlag, &item.CreatedAt, &item.UpdatedAt,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		item.IsDisposed = disposedFlag == 1
		inventory = append(inventory, item)
	}
	c.JSON(http.StatusOK, inventory)
}

// updateProductInfo updates the product_info field for a product.
func updateProductInfo(c *gin.Context) {
	var req struct {
		ProductCD   string `json:"product_cd"`
		ProductInfo string `json:"product_info"`
		RequestID   string `json:"request_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.ProductCD = normalizeBarcodeInput(req.ProductCD)
	if req.ProductCD == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "product_cd is required"})
		return
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
		err = tx.QueryRow("SELECT COUNT(1) FROM product_info_log WHERE request_id = ?", req.RequestID).Scan(&reqDupCount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if reqDupCount > 0 {
			c.JSON(http.StatusOK, gin.H{"message": "Duplicate request ignored"})
			return
		}
	}

	var currentInfo string
	err = tx.QueryRow(`
		SELECT COALESCE(product_info, '')
		FROM products
		WHERE product_cd = ?
	`, req.ProductCD).Scan(&currentInfo)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if currentInfo == req.ProductInfo {
		c.JSON(http.StatusOK, gin.H{"message": "No changes"})
		return
	}

	_, err = tx.Exec(`
		UPDATE products
		SET product_info = ?
		WHERE product_cd = ?
	`, req.ProductInfo, req.ProductCD)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var requestID interface{}
	if req.RequestID != "" {
		requestID = req.RequestID
	} else {
		requestID = nil
	}

	insertRes, err := tx.Exec(`
		INSERT INTO product_info_log (product_cd, old_product_info, new_product_info, request_id)
		VALUES (?, ?, ?, ?)
		ON CONFLICT (request_id) DO NOTHING
	`, req.ProductCD, currentInfo, req.ProductInfo, requestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if req.RequestID != "" {
		affected, affErr := insertRes.RowsAffected()
		if affErr == nil && affected == 0 {
			c.JSON(http.StatusOK, gin.H{"message": "Duplicate request ignored"})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Product info updated"})
}

// updateInventory updates stock quantity
func updateInventory(c *gin.Context) {
	var req struct {
		ProductCD    string `json:"product_cd"`
		Action       string `json:"action"` // "in", "out", "dispose" or "purchase"
		Quantity     int    `json:"quantity"`
		DepartmentID string `json:"department_id"`
		StaffID      string `json:"staff_id"`
		StatusID     string `json:"status_id"`
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
	requiresDepartment := req.Action != "purchase"
	if requiresDepartment && req.DepartmentID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "department_id is required"})
		return
	}
	if !requiresDepartment {
		req.DepartmentID = ""
		req.StaffID = ""
	}

	isSyntheticStaff := req.StaffID == "Shared" || req.StaffID == "Loaner"

	eventID, eventName, delta, eventErr := resolveEventByAction(req.Action)
	if eventErr == sql.ErrNoRows {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid action"})
		return
	}
	if eventErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "event_master lookup failed"})
		return
	}

	var err error
	if requiresDepartment {
		var departmentCount int
		err = db.QueryRow("SELECT COUNT(1) FROM booking_busyo WHERE busyo_cd = ?", req.DepartmentID).Scan(&departmentCount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if departmentCount == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid department_id"})
			return
		}
	}

	if requiresDepartment && req.StaffID != "" && !isSyntheticStaff {
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

	if req.StatusID != "" {
		var statusCount int
		statusCols, colErr := resolveStatusMasterColumns()
		if colErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": colErr.Error()})
			return
		}
		statusCheckQuery := fmt.Sprintf("SELECT COUNT(1) FROM status_master WHERE %s = ?", statusCols.ID)
		err = db.QueryRow(statusCheckQuery, req.StatusID).Scan(&statusCount)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if statusCount == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid status_id"})
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

	var busyoID interface{}
	if req.DepartmentID != "" {
		busyoID = req.DepartmentID
	} else {
		busyoID = nil
	}

	var requestID interface{}
	if req.RequestID != "" {
		requestID = req.RequestID
	} else {
		requestID = nil
	}

	stockLogRes, err := tx.Exec(`
		INSERT INTO stock_log (product_cd, busyo_id, kean_id, event_id, quantity, request_id)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (request_id) DO NOTHING
	`, req.ProductCD, busyoID, keanID, eventID, req.Quantity, requestID)
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

	if req.StatusID != "" {
		_, err = tx.Exec(`
			UPDATE products
			SET status_id = ?
			WHERE product_cd = ?
		`, req.StatusID, req.ProductCD)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
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
		"status_id":     req.StatusID,
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
	statusCols, colErr := resolveStatusMasterColumns()
	if colErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": colErr.Error()})
		return
	}

	query := fmt.Sprintf(`
		SELECT 
			p.product_cd,
			COALESCE(p.product_name, ''),
			COALESCE(p.category_id, ''),
			COALESCE(pc.name, ''),
			COALESCE(p.maker_id, ''),
			COALESCE(m.name, ''),
			COALESCE(p.status_id, ''),
			COALESCE(sm.%s, ''),
			COALESCE(p.model_number, ''),
			COALESCE(p.product_info, ''),
			COALESCE(p.remarks, ''),
			COALESCE((
				SELECT sl.busyo_id
				FROM stock_log sl
				INNER JOIN event_master em ON em.id = sl.event_id
				WHERE sl.product_cd = p.product_cd
				  AND em.name = '出庫'
				ORDER BY sl.created_at DESC, sl.id DESC
				LIMIT 1
			), ''),
			COALESCE((
				SELECT b.name
				FROM stock_log sl
				INNER JOIN event_master em ON em.id = sl.event_id
				LEFT JOIN booking_busyo b ON b.busyo_cd = sl.busyo_id
				WHERE sl.product_cd = p.product_cd
				  AND em.name = '出庫'
				ORDER BY sl.created_at DESC, sl.id DESC
				LIMIT 1
			), ''),
			COALESCE((
				SELECT sl.kean_id
				FROM stock_log sl
				INNER JOIN event_master em ON em.id = sl.event_id
				WHERE sl.product_cd = p.product_cd
				  AND em.name = '出庫'
				ORDER BY sl.created_at DESC, sl.id DESC
				LIMIT 1
			), ''),
			COALESCE((
				SELECT k.name
				FROM stock_log sl
				INNER JOIN event_master em ON em.id = sl.event_id
				LEFT JOIN booking_keanid k ON k.alias = sl.kean_id
				WHERE sl.product_cd = p.product_cd
				  AND em.name = '出庫'
				ORDER BY sl.created_at DESC, sl.id DESC
				LIMIT 1
			), ''),
			COALESCE(i.stock_quantity, 0), 
			CASE WHEN EXISTS (
				SELECT 1
				FROM stock_log sl
				INNER JOIN event_master em ON em.id = sl.event_id
				WHERE sl.product_cd = p.product_cd
				  AND em.name = '廃棄'
			) THEN 1 ELSE 0 END,
			COALESCE(i.created_at::text, ''), COALESCE(i.updated_at::text, '')
		FROM products p
		LEFT JOIN product_category pc ON p.category_id = pc.id
		LEFT JOIN maker m ON p.maker_id = m.id
		LEFT JOIN status_master sm ON p.status_id = sm.%s
		LEFT JOIN inventory i ON p.product_cd = i.product_cd
		WHERE p.product_cd = ?
	`, statusCols.Name, statusCols.ID)

	var disposedFlag int
	err := db.QueryRow(query, normalizedBarcode).Scan(
		&item.Product.ProductCD, &item.Product.ProductName,
		&item.Product.CategoryID, &item.Product.CategoryName,
		&item.Product.MakerID, &item.Product.MakerName,
		&item.Product.StatusID, &item.Product.StatusName,
		&item.Product.ModelNumber, &item.Product.ProductInfo, &item.Product.Remarks,
		&item.LoanDepartmentID, &item.LoanDepartmentName,
		&item.LoanStaffID, &item.LoanStaffName,
		&item.StockQuantity, &disposedFlag, &item.CreatedAt, &item.UpdatedAt,
	)
	item.IsDisposed = disposedFlag == 1

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
		return
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, item)
}

/*
Separated SQL for external migration files (.sql):

-- 001_stock_log.sql
CREATE TABLE IF NOT EXISTS stock_log (
	id BIGSERIAL PRIMARY KEY,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	product_cd CHAR(13),
	busyo_id CHAR(2),
	kean_id VARCHAR(20),
	event_id CHAR(2),
	quantity INTEGER NOT NULL DEFAULT 1,
	request_id TEXT,
	FOREIGN KEY (product_cd) REFERENCES products(product_cd),
	FOREIGN KEY (busyo_id) REFERENCES booking_busyo(busyo_cd),
	FOREIGN KEY (event_id) REFERENCES event_master(id)
);

ALTER TABLE stock_log ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stock_log ADD COLUMN IF NOT EXISTS request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_log_request_id
	ON stock_log(request_id)
	WHERE request_id IS NOT NULL;

-- 002_product_info_log.sql
CREATE TABLE IF NOT EXISTS product_info_log (
	id BIGSERIAL PRIMARY KEY,
	created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
	product_cd CHAR(13) NOT NULL,
	old_product_info TEXT,
	new_product_info TEXT,
	request_id TEXT,
	FOREIGN KEY (product_cd) REFERENCES products(product_cd)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_product_info_log_request_id
	ON product_info_log(request_id)
	WHERE request_id IS NOT NULL;

-- 003_products_indexes.sql
CREATE UNIQUE INDEX IF NOT EXISTS ux_products_product_cd
	ON products(product_cd)
	WHERE COALESCE(product_cd, '') <> '';
*/
