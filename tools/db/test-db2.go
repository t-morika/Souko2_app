package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "modernc.org/sqlite"
)

func main() {
	dbPath := "c:\\Users\\ks24.m-takahashi\\Desktop\\souko_2\\inventory_test.db"

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
	fmt.Println("\n=== All Tables ===")
	rows, _ := db.Query(`
		SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
	`)
	for rows.Next() {
		var name string
		rows.Scan(&name)
		fmt.Println(name)
	}
	rows.Close()

	// Get schema for each table
	fmt.Println("\n=== Table Schemas ===")
	rows, _ = db.Query(`
		SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
	`)
	var tableNames []string
	for rows.Next() {
		var name string
		rows.Scan(&name)
		tableNames = append(tableNames, name)
	}
	rows.Close()

	for _, tableName := range tableNames {
		fmt.Printf("\n-- %s --\n", tableName)
		schema, _ := db.Query(fmt.Sprintf(`PRAGMA table_info(%s)`, tableName))
		for schema.Next() {
			var cid int
			var name, typ string
			var notnull, dflt_value interface{}
			var pk int
			schema.Scan(&cid, &name, &typ, &notnull, &dflt_value, &pk)
			fmt.Printf("  %s: %s\n", name, typ)
		}
		schema.Close()

		// Count rows
		count := 0
		db.QueryRow(fmt.Sprintf(`SELECT COUNT(*) FROM %s`, tableName)).Scan(&count)
		fmt.Printf("  Total rows: %d\n", count)
	}
}
