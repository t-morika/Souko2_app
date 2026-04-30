document.addEventListener('DOMContentLoaded', function() {
    const barcodeInput = document.getElementById('barcode');
    const searchBarcodeBtn = document.getElementById('search-barcode');
    const categorySelect = document.getElementById('category-select');
    const productSelect = document.getElementById('product-select');
    const quantityInput = document.getElementById('quantity');
    const stockInBtn = document.getElementById('stock-in');
    const stockOutBtn = document.getElementById('stock-out');
    const inventoryTable = document.getElementById('inventory-table').querySelector('tbody');
    const printBtn = document.getElementById('print-inventory');

    let products = [];
    let inventory = [];

    // Load products and inventory
    loadProducts();
    loadInventory();

    // Event listeners
    searchBarcodeBtn.addEventListener('click', searchByBarcode);
    categorySelect.addEventListener('change', filterProducts);
    productSelect.addEventListener('change', updateSelectedProduct);
    stockInBtn.addEventListener('click', () => updateStock('in'));
    stockOutBtn.addEventListener('click', () => updateStock('out'));
    printBtn.addEventListener('click', printInventory);

    // Enter key for barcode
    barcodeInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchByBarcode();
        }
    });

    function loadProducts() {
        fetch('/api/products')
            .then(response => response.json())
            .then(data => {
                products = data;
                populateProductSelect(products);
            })
            .catch(error => console.error('Error loading products:', error));
    }

    function loadInventory() {
        fetch('/api/inventory')
            .then(response => response.json())
            .then(data => {
                inventory = data;
                displayInventory(inventory);
            })
            .catch(error => console.error('Error loading inventory:', error));
    }

    function populateProductSelect(prods) {
        productSelect.innerHTML = '<option value="">製品を選択</option>';
        prods.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.category} - ${product.manufacturer} ${product.name}`;
            productSelect.appendChild(option);
        });
    }

    function filterProducts() {
        const selectedCategory = categorySelect.value;
        let filteredProducts = products;
        if (selectedCategory) {
            filteredProducts = products.filter(p => p.category === selectedCategory);
        }
        populateProductSelect(filteredProducts);
    }

    function updateSelectedProduct() {
        // Optional: highlight or something
    }

    function searchByBarcode() {
        const barcode = barcodeInput.value.trim();
        if (!barcode) return;

        fetch('/api/barcode/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode })
        })
        .then(response => response.json())
        .then(product => {
            // Set category and product
            categorySelect.value = product.category;
            filterProducts();
            productSelect.value = product.id;
            barcodeInput.value = '';
        })
        .catch(error => {
            alert('製品が見つかりません');
            console.error('Error searching by barcode:', error);
        });
    }

    function updateStock(action) {
        const productId = parseInt(productSelect.value);
        const quantity = parseInt(quantityInput.value);

        if (!productId || !quantity) {
            alert('製品と数量を選択してください');
            return;
        }

        fetch('/api/inventory/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product_id: productId, action, quantity })
        })
        .then(response => response.json())
        .then(data => {
            if (data.message) {
                loadInventory(); // Refresh inventory
                alert(`${action === 'in' ? '入庫' : '出庫'}が完了しました`);
            } else {
                alert(data.error);
            }
        })
        .catch(error => console.error('Error updating stock:', error));
    }

    function displayInventory(inv) {
        inventoryTable.innerHTML = '';
        inv.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.product.category}</td>
                <td>${item.product.manufacturer}</td>
                <td>${item.product.name}</td>
                <td>${item.quantity}</td>
            `;
            inventoryTable.appendChild(row);
        });
    }

    function printInventory() {
        window.print();
    }
});