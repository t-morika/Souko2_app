package main

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	_ "modernc.org/sqlite"
)

type Product struct {
	ID           int    `json:"id"`
	Category     string `json:"category"`
	Manufacturer string `json:"manufacturer"`
	Name         string `json:"name"`
	Barcode      string `json:"barcode"`
}

type InventoryItem struct {
	Product Product `json:"product"`
	Quantity int    `json:"quantity"`
}

var db *sql.DB

func initDB() {
	var err error
	db, err = sql.Open("sqlite", "./inventory.db")
	if err != nil {
		log.Fatal(err)
	}

	// Create tables
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS products (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			category TEXT NOT NULL,
			manufacturer TEXT NOT NULL,
			name TEXT NOT NULL,
			barcode TEXT UNIQUE
		);
		CREATE TABLE IF NOT EXISTS inventory (
			product_id INTEGER PRIMARY KEY,
			quantity INTEGER DEFAULT 0,
			FOREIGN KEY (product_id) REFERENCES products(id)
		);
	`)
	if err != nil {
		log.Fatal(err)
	}

	// Insert sample data if empty
	var count int
	db.QueryRow("SELECT COUNT(*) FROM products").Scan(&count)
	if count == 0 {
		sampleProducts := []Product{
			{Category: "マウス", Manufacturer: "Logitech", Name: "MX Master 3", Barcode: "123456789012"},
			{Category: "セキュリティワイヤー", Manufacturer: "Kensington", Name: "Kensington Lock", Barcode: "234567890123"},
			{Category: "ノートPC", Manufacturer: "Dell", Name: "XPS 13", Barcode: "345678901234"},
			{Category: "一体型PC", Manufacturer: "Apple", Name: "iMac 24", Barcode: "456789012345"},
			{Category: "モニター", Manufacturer: "Samsung", Name: "27\" UHD Monitor", Barcode: "567890123456"},
			// Add more as needed
		}
		for _, p := range sampleProducts {
			_, err := db.Exec("INSERT INTO products (category, manufacturer, name, barcode) VALUES (?, ?, ?, ?)", p.Category, p.Manufacturer, p.Name, p.Barcode)
			if err != nil {
				log.Printf("Error inserting product: %v", err)
			}
			var id int
			db.QueryRow("SELECT last_insert_rowid()").Scan(&id)
			db.Exec("INSERT INTO inventory (product_id, quantity) VALUES (?, 0)", id)
		}
	}
}

func main() {
	initDB()
	defer db.Close()

	r := gin.Default()

	// Serve static files
	r.Static("/static", "./")

	// API routes
	r.GET("/api/products", getProducts)
	r.GET("/api/inventory", getInventory)
	r.POST("/api/inventory/update", updateInventory)
	r.POST("/api/barcode/search", searchByBarcode)

	// Serve index.html
	r.GET("/", func(c *gin.Context) {
		c.File("./index.html")
	})

	log.Println("Server starting on http://localhost:8080")
	r.Run(":8080")
}

func getProducts(c *gin.Context) {
	rows, err := db.Query("SELECT id, category, manufacturer, name, barcode FROM products ORDER BY category, name")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var products []Product
	for rows.Next() {
		var p Product
		rows.Scan(&p.ID, &p.Category, &p.Manufacturer, &p.Name, &p.Barcode)
		products = append(products, p)
	}
	c.JSON(http.StatusOK, products)
}

func getInventory(c *gin.Context) {
	rows, err := db.Query(`
		SELECT p.id, p.category, p.manufacturer, p.name, p.barcode, i.quantity
		FROM products p
		LEFT JOIN inventory i ON p.id = i.product_id
		ORDER BY p.category, p.name
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var inventory []InventoryItem
	for rows.Next() {
		var item InventoryItem
		rows.Scan(&item.Product.ID, &item.Product.Category, &item.Product.Manufacturer, &item.Product.Name, &item.Product.Barcode, &item.Quantity)
		inventory = append(inventory, item)
	}
	c.JSON(http.StatusOK, inventory)
}

func updateInventory(c *gin.Context) {
	var req struct {
		ProductID int `json:"product_id"`
		Action    string `json:"action"` // "in" or "out"
		Quantity  int `json:"quantity"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var currentQty int
	db.QueryRow("SELECT quantity FROM inventory WHERE product_id = ?", req.ProductID).Scan(&currentQty)

	var newQty int
	if req.Action == "in" {
		newQty = currentQty + req.Quantity
	} else if req.Action == "out" {
		newQty = currentQty - req.Quantity
		if newQty < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Insufficient stock"})
			return
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid action"})
		return
	}

	_, err := db.Exec("UPDATE inventory SET quantity = ? WHERE product_id = ?", newQty, req.ProductID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Inventory updated"})
}

func searchByBarcode(c *gin.Context) {
	var req struct {
		Barcode string `json:"barcode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var product Product
	err := db.QueryRow("SELECT id, category, manufacturer, name, barcode FROM products WHERE barcode = ?", req.Barcode).Scan(&product.ID, &product.Category, &product.Manufacturer, &product.Name, &product.Barcode)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Product not found"})
		return
	}
	c.JSON(http.StatusOK, product)
}