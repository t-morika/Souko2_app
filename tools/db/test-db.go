package main

import (
	"database/sql"
	"fmt"
	"log"
	"path/filepath"
	"os"

	_ "modernc.org/sqlite"
)

func main() {
	exePath, err := os.Executable()
	if err != nil {
		log.Fatal(err)
	}
	baseDir := filepath.Dir(exePath)
	dbPath := filepath.Join(baseDir, "inventory_test.db")

	fmt.Printf("Opening database: %s\n", dbPath)

	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal(err)
	}

	fmt.Println("✓ Database opened successfully")

	// Check tables
	fmt.Println("\n=== Tables ===")
	rows, _ := db.Query(`
		SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
	`)
	for rows.Next() {
		var name string
		rows.Scan(&name)
		fmt.Println(name)
	}
	rows.Close()

	// Check product_category data
	fmt.Println("\n=== product_category ===")
	rows, err = db.Query(`SELECT id, name FROM product_category ORDER BY id`)
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
	} else {
		count := 0
		for rows.Next() {
			var id, name string
			rows.Scan(&id, &name)
			fmt.Printf("%s | %s\n", id, name)
			count++
		}
		fmt.Printf("Total: %d\n", count)
		rows.Close()
	}

	// Check products data
	fmt.Println("\n=== products (first 5) ===")
	rows, err = db.Query(`SELECT product_cd, product_name, category_id FROM products LIMIT 5`)
	if err != nil {
		fmt.Printf("ERROR: %v\n", err)
	} else {
		for rows.Next() {
			var cd, name, catID string
			rows.Scan(&cd, &name, &catID)
			fmt.Printf("%s | %s | %s\n", cd, name, catID)
		}
		rows.Close()
	}
}
