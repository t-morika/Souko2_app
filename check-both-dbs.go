package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

func main() {
	// Check old database
	fmt.Println("=== inventory.db ===")
	db1, err := sql.Open("sqlite", "c:\\Users\\ks24.m-takahashi\\Desktop\\souko_2\\inventory.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db1.Close()

	rows, _ := db1.Query(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
	for rows.Next() {
		var name string
		rows.Scan(&name)
		fmt.Println(name)
	}
	rows.Close()

	var count int
	db1.QueryRow(`SELECT COUNT(*) FROM inventory`).Scan(&count)
	fmt.Printf("inventory table: %d rows\n", count)

	// Check new database
	fmt.Println("\n=== inventory_test.db ===")
	db2, err := sql.Open("sqlite", "c:\\Users\\ks24.m-takahashi\\Desktop\\souko_2\\inventory_test.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db2.Close()

	rows, _ = db2.Query(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
	for rows.Next() {
		var name string
		rows.Scan(&name)
		fmt.Println(name)
	}
	rows.Close()

	db2.QueryRow(`SELECT COUNT(*) FROM product_category`).Scan(&count)
	fmt.Printf("product_category table: %d rows\n", count)

	db2.QueryRow(`SELECT COUNT(*) FROM products`).Scan(&count)
	fmt.Printf("products table: %d rows\n", count)

	db2.QueryRow(`SELECT COUNT(*) FROM inventory`).Scan(&count)
	fmt.Printf("inventory table: %d rows\n", count)

	db2.QueryRow(`SELECT COUNT(*) FROM maker`).Scan(&count)
	fmt.Printf("maker table: %d rows\n", count)
}
