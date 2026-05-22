package main
import (
  "database/sql"
  "fmt"
  _ "modernc.org/sqlite"
)
func main(){
  db, err := sql.Open("sqlite", "inventory_test.db")
  if err != nil { panic(err) }
  defer db.Close()
  rows, err := db.Query("SELECT id, product_cd, busyo_id, COALESCE(kean_id,''), event_id, quantity, created_at FROM stock_log WHERE product_cd='1604101010001' ORDER BY id DESC LIMIT 4")
  if err != nil { panic(err) }
  defer rows.Close()
  for rows.Next(){
    var id int
    var p,b,k,e,c string
    var q int
    if err := rows.Scan(&id,&p,&b,&k,&e,&q,&c); err != nil { panic(err) }
    fmt.Printf("id=%d product=%s busyo=%s kean=%s event=%s qty=%d at=%s\n", id,p,b,k,e,q,c)
  }
}
