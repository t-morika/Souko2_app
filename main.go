package main

import (
	"database/sql"
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
	Product        ProductDTO `json:"product"`
	StockQuantity  int        `json:"stock_quantity"`
	CreatedAt      string     `json:"created_at"`
	UpdatedAt      string     `json:"updated_at"`
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

	// Use inventory_test.db instead of inventory.db
	initDB(filepath.Join(baseDir, "inventory_test.db"))
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
		ProductCD string `json:"product_cd"`
		Action    string `json:"action"` // "in", "out" or "dispose"
		Quantity  int    `json:"quantity"`
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

	eventID, eventName, delta, eventErr := resolveEventByAction(req.Action)
	if eventErr == sql.ErrNoRows {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid action"})
		return
	}
	if eventErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "event_master lookup failed"})
		return
	}

	var currentQty int
	err := db.QueryRow("SELECT COALESCE(stock_quantity, 0) FROM inventory WHERE product_cd = ?", req.ProductCD).Scan(&currentQty)
	if err != nil && err != sql.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	newQty := currentQty + (delta * req.Quantity)
	if newQty < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Insufficient stock"})
		return
	}

	// Insert or update inventory
	_, err = db.Exec(`
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
	c.JSON(http.StatusOK, gin.H{
		"message":    "Inventory updated",
		"event_id":   eventID,
		"event_name": eventName,
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
