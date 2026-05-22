package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

func main() {
	// Check old inventory.db
	fmt.Println("=== OLD SCHEMA (inventory.db) ===")
	oldDB, err := sql.Open("sqlite", "c:\\Users\\ks24.m-takahashi\\Desktop\\souko_2\\inventory.db")
	if err != nil {
		log.Fatal(err)
	}
	defer oldDB.Close()

	fmt.Println("\n--- products (first 5) ---")
	rows, _ := oldDB.Query(`SELECT * FROM products LIMIT 5`)
	cols, _ := rows.Columns()
	fmt.Printf("Columns: %v\n", cols)
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		rows.Scan(ptrs...)
		fmt.Printf("Row: %v\n", vals)
	}
	rows.Close()

	fmt.Println("\n--- inventory (all) ---")
	rows, _ = oldDB.Query(`SELECT * FROM inventory`)
	cols, _ = rows.Columns()
	fmt.Printf("Columns: %v\n", cols)
	count := 0
	for rows.Next() {
		count++
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		rows.Scan(ptrs...)
		fmt.Printf("Row %d: %v\n", count, vals)
	}
	rows.Close()

	// Check new schema targets
	fmt.Println("\n\n=== NEW SCHEMA (inventory_test.db) ===")
	newDB, err := sql.Open("sqlite", "c:\\Users\\ks24.m-takahashi\\Desktop\\souko_2\\inventory_test.db")
	if err != nil {
		log.Fatal(err)
	}
	defer newDB.Close()

	fmt.Println("\n--- product_category ---")
	rows, _ = newDB.Query(`SELECT id, name FROM product_category`)
	count = 0
	for rows.Next() {
		count++
		var id, name string
		rows.Scan(&id, &name)
		fmt.Printf("%s | %s\n", id, name)
	}
	fmt.Printf("Total: %d rows\n", count)
	rows.Close()

	fmt.Println("\n--- maker ---")
	rows, _ = newDB.Query(`SELECT id, name FROM maker`)
	count = 0
	for rows.Next() {
		count++
		var id, name string
		rows.Scan(&id, &name)
		fmt.Printf("%s | %s\n", id, name)
	}
	fmt.Printf("Total: %d rows\n", count)
	rows.Close()

	fmt.Println("\n--- products ---")
	rows, _ = newDB.Query(`SELECT product_cd, product_name, category_id, maker_id FROM products LIMIT 5`)
	cols, _ = rows.Columns()
	fmt.Printf("Columns: %v\n", cols)
	count = 0
	for rows.Next() {
		count++
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		rows.Scan(ptrs...)
		fmt.Printf("Row: %v\n", vals)
	}
	if count == 0 {
		fmt.Println("*** NO DATA ***")
	}
	rows.Close()
}
