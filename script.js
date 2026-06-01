document.addEventListener('DOMContentLoaded', function () {
    var barcodeInput = document.getElementById('barcode');
    var searchBarcodeBtn = document.getElementById('search-barcode');
    var categorySelect = document.getElementById('category-select');
    var makerSelect = document.getElementById('maker-select');
    var deviceList = document.getElementById('device-list');
    var productDetail = document.getElementById('product-detail');
    var stockInBtn = document.getElementById('stock-in');
    var stockOutBtn = document.getElementById('stock-out');
    var stockDisposeBtn = document.getElementById('stock-dispose');
    var stockPurchaseBtn = document.getElementById('stock-purchase');
    var executionSection = document.querySelector('.execution-section');
    var confirmModal = document.getElementById('confirm-modal');
    var confirmMessage = document.getElementById('confirm-message');
    var confirmNoBtn = document.getElementById('confirm-no');
    var confirmYesBtn = document.getElementById('confirm-yes');
    var notifications = document.getElementById('notifications');
    var listTabButtons = document.querySelectorAll('.list-tab-btn');
    var listPaneMain = document.getElementById('list-pane-main');
    var listPane1 = document.getElementById('list-pane-1');
    var listPane2 = document.getElementById('list-pane-2');

    var categories = [];
    var makers = [];
    var departments = [];
    var staffs = [];
    var inventoryItems = [];
    var selectedCategory = '';
    var selectedMaker = '';
    var selectedDepartment = '';
    var selectedStaff = '';
    var currentProduct = null;
    var pendingUpdate = null;
    var currentPhase = 'category';
    var currentListTab = 'main';
    var numpadRoot = null;
    var isSubmittingUpdate = false;
    var isPurchaseMode = false;

    function setActiveListTab(tabName) {
        currentListTab = tabName;

        for (var i = 0; i < listTabButtons.length; i++) {
            var btn = listTabButtons[i];
            var isActive = btn.dataset && btn.dataset.listTab === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        }

        if (listPaneMain) {
            var mainActive = tabName === 'main';
            listPaneMain.classList.toggle('active', mainActive);
            listPaneMain.setAttribute('aria-hidden', mainActive ? 'false' : 'true');
        }
        if (listPane1) {
            var pane1Active = tabName === 'list1';
            listPane1.classList.toggle('active', pane1Active);
            listPane1.setAttribute('aria-hidden', pane1Active ? 'false' : 'true');
        }
        if (listPane2) {
            var pane2Active = tabName === 'list2';
            listPane2.classList.toggle('active', pane2Active);
            listPane2.setAttribute('aria-hidden', pane2Active ? 'false' : 'true');
        }

        if (tabName !== 'main') {
            currentProduct = null;
            renderDefaultPlaceholder();
            updateRegistrationFlowState();
        }
    }

    function createRequestId() {
        return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }

    function getSelectedCategoryName() {
        if (!selectedCategory) return '';
        for (var i = 0; i < categories.length; i++) {
            if (categories[i].id === selectedCategory) return categories[i].name || '';
        }
        return '';
    }

    function shouldShowStockStatusByCategory(categoryName) {
        return categoryName === 'ノートPC' || categoryName === '一体型PC' || categoryName === 'モニター';
    }

    function shouldHideQuantitySelectorByCategory(categoryName) {
        return shouldShowStockStatusByCategory(categoryName);
    }

    function getStockDisplayText(stockQuantity, categoryName) {
        if (shouldShowStockStatusByCategory(categoryName)) {
            return Number(stockQuantity) > 0 ? '在庫あり' : '在庫なし';
        }
        return String(stockQuantity);
    }

    function getFilteredStaffs() {
        if (!selectedDepartment) return [];
        return staffs.filter(function (staff) {
            return (staff.busyo_id || '') === selectedDepartment;
        });
    }

    function getActionLabel(action) {
        if (action === 'in') return '入庫';
        if (action === 'out') return '出庫';
        if (action === 'dispose') return '廃棄';
        if (action === 'purchase') return '在庫追加';
        return action || '';
    }

    function bindPurchaseModeButton() {
        var purchaseModeToggleBtn = document.getElementById('purchase-mode-toggle');
        if (!purchaseModeToggleBtn) return;

        purchaseModeToggleBtn.setAttribute('aria-pressed', isPurchaseMode ? 'true' : 'false');
        purchaseModeToggleBtn.classList.toggle('active', isPurchaseMode);
        purchaseModeToggleBtn.textContent = isPurchaseMode ? '購入モード中（解除）' : '購入モード';
        purchaseModeToggleBtn.onclick = function () {
            setPurchaseMode(!isPurchaseMode);
        };
    }

    function setPurchaseMode(enabled) {
        isPurchaseMode = !!enabled;
        if (isPurchaseMode) {
            selectedDepartment = '';
            selectedStaff = '';
            setActiveListTab('main');
        }

        if (currentProduct) {
            selectProduct(currentProduct);
        } else {
            renderDefaultPlaceholder();
        }
        updateRegistrationFlowState();

        if (isPurchaseMode && barcodeInput) {
            setTimeout(function () {
                barcodeInput.focus();
            }, 0);
        }
    }

    function setActionButtonVisible(button, visible) {
        if (!button) return;
        button.hidden = !visible;
        button.classList.toggle('is-hidden', !visible);
    }

    function updateRegistrationFlowState() {
        var hasProduct = !!currentProduct;
        var hasDepartment = !!selectedDepartment;
        var canChooseQuantity = hasProduct && (isPurchaseMode || hasDepartment);
        var currentStock = hasProduct ? Number(currentProduct.stock_quantity || 0) : 0;
        var currentCategoryName = hasProduct && currentProduct.product ? (currentProduct.product.category_name || '') : '';
        var isUniqueBarcodeCategory = shouldShowStockStatusByCategory(currentCategoryName);
        var canStockOut = !isPurchaseMode && canChooseQuantity && currentStock > 0;
        var canStockIn = !isPurchaseMode && canChooseQuantity && !(isUniqueBarcodeCategory && currentStock > 0);
        var canDispose = !isPurchaseMode && canChooseQuantity;
        var canPurchase = isPurchaseMode && hasProduct;

        var quantityInput = document.getElementById('quantity');
        var minusBtn = document.getElementById('quantity-minus');
        var plusBtn = document.getElementById('quantity-plus');

        if (quantityInput) quantityInput.disabled = !canChooseQuantity;
        if (minusBtn) minusBtn.disabled = !canChooseQuantity;
        if (plusBtn) plusBtn.disabled = !canChooseQuantity;

        if (stockInBtn) stockInBtn.disabled = !canStockIn;
        if (stockOutBtn) stockOutBtn.disabled = !canStockOut;
        if (stockDisposeBtn) stockDisposeBtn.disabled = !canDispose;
        if (stockPurchaseBtn) stockPurchaseBtn.disabled = !canPurchase;

        setActionButtonVisible(stockInBtn, !isPurchaseMode);
        setActionButtonVisible(stockOutBtn, !isPurchaseMode);
        setActionButtonVisible(stockDisposeBtn, !isPurchaseMode);
        setActionButtonVisible(stockPurchaseBtn, isPurchaseMode);
        if (executionSection) executionSection.classList.toggle('purchase-mode', isPurchaseMode);
    }

    function requestJSON(url, options, onSuccess, onError) {
        fetch(url, options || {})
            .then(function (res) {
                return res.json().then(function (json) {
                    if (!res.ok) throw json;
                    return json;
                });
            })
            .then(onSuccess)
            .catch(function (err) {
                if (onError) onError(err);
            });
    }

    function normalizeBarcodeInput(value) {
        if (!value) return '';
        return value.replace(/[\u3000]/g, ' ').replace(/[！-～]/g, function (ch) {
            return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
        }).trim();
    }

    function buildBarcodeNumpad() {
        if (numpadRoot) return;

        var root = document.createElement('div');
        root.id = 'barcode-numpad';
        root.className = 'barcode-numpad';
        root.setAttribute('aria-hidden', 'true');

        root.innerHTML =
            '<div class="barcode-numpad-panel" role="dialog" aria-label="バーコード入力テンキー">' +
            '<div class="barcode-numpad-head">' +
            '<span>テンキー入力</span>' +
            '<button type="button" class="numpad-close" data-key="close" aria-label="閉じる">×</button>' +
            '</div>' +
            '<div class="barcode-numpad-grid">' +
            '<button type="button" data-key="7">7</button>' +
            '<button type="button" data-key="8">8</button>' +
            '<button type="button" data-key="9">9</button>' +
            '<button type="button" data-key="4">4</button>' +
            '<button type="button" data-key="5">5</button>' +
            '<button type="button" data-key="6">6</button>' +
            '<button type="button" data-key="1">1</button>' +
            '<button type="button" data-key="2">2</button>' +
            '<button type="button" data-key="3">3</button>' +
            '<button type="button" class="numpad-secondary" data-key="clear">C</button>' +
            '<button type="button" data-key="0">0</button>' +
            '<button type="button" class="numpad-secondary" data-key="backspace">⌫</button>' +
            '</div>' +
            '<div class="barcode-numpad-foot">' +
            '<button type="button" class="numpad-enter" data-key="enter">検索</button>' +
            '</div>' +
            '</div>';

        root.addEventListener('click', function (event) {
            var target = event.target;
            if (!(target instanceof HTMLElement)) return;
            var key = target.dataset ? target.dataset.key : '';
            if (!key) return;

            if (key === 'close') {
                hideBarcodeNumpad();
                return;
            }
            if (key === 'clear') {
                barcodeInput.value = '';
                barcodeInput.focus();
                return;
            }
            if (key === 'backspace') {
                barcodeInput.value = barcodeInput.value.slice(0, -1);
                barcodeInput.focus();
                return;
            }
            if (key === 'enter') {
                hideBarcodeNumpad();
                searchByBarcode();
                return;
            }

            barcodeInput.value += key;
            barcodeInput.focus();
        });

        document.body.appendChild(root);
        numpadRoot = root;
    }

    function showBarcodeNumpad() {
        if (!numpadRoot) return;
        numpadRoot.classList.add('visible');
        numpadRoot.setAttribute('aria-hidden', 'false');
    }

    function hideBarcodeNumpad() {
        if (!numpadRoot) return;
        numpadRoot.classList.remove('visible');
        numpadRoot.setAttribute('aria-hidden', 'true');
    }

    function showNotification(message, type) {
        if (!notifications) return;
        var notification = document.createElement('div');
        notification.className = 'notification ' + (type || 'in');
        notification.innerHTML = '<div class="notification-icon"></div><span class="notification-message">' + message + '</span>';
        notifications.appendChild(notification);
        setTimeout(function () {
            if (notification && notification.parentNode) notification.parentNode.removeChild(notification);
        }, 3000);
    }

    function renderDefaultPlaceholder() {
        productDetail.innerHTML =
            '<div class="placeholder">' +
            '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">' +
            '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>' +
            '</svg>' +
            '<p>製品を選択してください</p>' +
            '<p class="description">左側の機器一覧から、製品を選択してください。</p>' +
            '<button id="purchase-mode-toggle" class="purchase-mode-btn" type="button" aria-pressed="false">購入モード</button>' +
            '</div>';
        bindPurchaseModeButton();
    }

    function updateSelectPlaceholderState(selectEl) {
        if (!selectEl) return;
        selectEl.classList.toggle('is-placeholder', !selectEl.value);
    }

    function renderCategorySelect() {
        categorySelect.innerHTML = '';
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '選択してください';
        categorySelect.appendChild(defaultOpt);
        for (var i = 0; i < categories.length; i++) {
            var cat = categories[i];
            var opt = document.createElement('option');
            opt.value = cat.id;
            opt.textContent = cat.name;
            if (selectedCategory === cat.id) opt.selected = true;
            categorySelect.appendChild(opt);
        }
        updateSelectPlaceholderState(categorySelect);
        // イベント
        categorySelect.onchange = function () {
            selectedCategory = categorySelect.value;
            updateSelectPlaceholderState(categorySelect);
            selectedMaker = '';
            currentPhase = selectedCategory ? 'maker' : 'category';
            currentProduct = null;
            renderDefaultPlaceholder();
            if (selectedCategory) {
                loadMakers(selectedCategory);
            } else {
                makers = [];
                renderMakerSelect();
                renderDeviceList();
            }
        };
    }

    function renderMakerSelect() {
        makerSelect.innerHTML = '';
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '選択してください';
        makerSelect.appendChild(defaultOpt);
        if (currentPhase === 'category' || !makers.length) {
            makerSelect.disabled = true;
            updateSelectPlaceholderState(makerSelect);
            return;
        }
        makerSelect.disabled = false;
        for (var i = 0; i < makers.length; i++) {
            var maker = makers[i];
            var opt = document.createElement('option');
            opt.value = maker.id;
            opt.textContent = maker.name;
            if (selectedMaker === maker.id) opt.selected = true;
            makerSelect.appendChild(opt);
        }
        updateSelectPlaceholderState(makerSelect);
        makerSelect.onchange = function () {
            selectedMaker = makerSelect.value;
            updateSelectPlaceholderState(makerSelect);
            currentPhase = selectedMaker ? 'product' : 'maker';
            currentProduct = null;
            renderDefaultPlaceholder();
            if (selectedMaker) {
                loadInventory(selectedCategory, selectedMaker);
            } else {
                inventoryItems = [];
                renderDeviceList();
            }
        };
    }

    function renderDeviceList() {
        deviceList.innerHTML = '';
        var selectedCategoryName = getSelectedCategoryName();

        if (currentPhase === 'category') {
            deviceList.innerHTML = '<div class="placeholder"><p>カテゴリを選択してください</p></div>';
            return;
        }
        if (currentPhase === 'maker') {
            deviceList.innerHTML = '<div class="placeholder"><p>メーカーを選択してください</p></div>';
            return;
        }
        if (!inventoryItems || inventoryItems.length === 0) {
            deviceList.innerHTML = '<div class="placeholder"><p>該当する製品がありません。</p></div>';
            return;
        }

        for (var i = 0; i < inventoryItems.length; i++) {
            (function (item) {
                var card = document.createElement('button');
                card.type = 'button';
                card.className = 'device-card';
                var stockDisplayText = getStockDisplayText(item.stock_quantity, selectedCategoryName);
                card.innerHTML =
                    '<div class="device-card-header">' +
                    '<div class="device-title-block">' +
                    '<div class="device-name">' + (item.product.product_name || '-') + '</div>' +
                    '<div class="device-barcode"><span class="device-barcode-label">バーコード</span>: <span class="device-barcode-value">' + (item.product.product_cd || '-') + '</span></div>' +
                    '</div>' +
                    '<div class="device-meta device-stock"><span><strong>' + stockDisplayText + '</strong></span></div>' +
                    '</div>';
                card.addEventListener('click', function () {
                    var cards = document.querySelectorAll('.device-card');
                    for (var j = 0; j < cards.length; j++) cards[j].classList.remove('active');
                    card.classList.add('active');
                    selectProduct(item);
                });
                deviceList.appendChild(card);
            })(inventoryItems[i]);
        }
    }

    function selectProduct(item) {
        currentProduct = item;
        var selectedCategoryName = getSelectedCategoryName();
        var productCategoryName = (item && item.product && item.product.category_name) ? item.product.category_name : selectedCategoryName;
        var currentStockText = getStockDisplayText(item.stock_quantity, productCategoryName);
        var productInfoText = (item && item.product && item.product.product_info) ? item.product.product_info : '-';
        var shouldHideQuantitySelector = shouldHideQuantitySelectorByCategory(productCategoryName);
        var quantitySectionHtml = '';
        var eventInputSectionHtml = '';
        var modeBannerHtml = '';

        if (isPurchaseMode) {
            modeBannerHtml =
                '<div class="purchase-mode-banner">' +
                '<span>購入モード中</span>' +
                '<button id="purchase-mode-toggle" class="purchase-mode-btn inline" type="button" aria-pressed="true">解除</button>' +
                '</div>';
            eventInputSectionHtml =
                '<div class="event-input-section purchase-mode-note">' +
                '<span class="section-label">購入モード</span>' +
                '<p class="purchase-mode-note-text">部署・職員の選択は不要です。在庫追加のみ実行できます。</p>' +
                '</div>';
        } else {
            eventInputSectionHtml =
                '<div class="event-input-section">' +
                '<span class="section-label">部署・職員選択</span>' +
                '<div class="event-select-grid">' +
                '<div class="event-select-block">' +
                '<label for="department-select" class="event-label">部署</label>' +
                '<select id="department-select" class="event-select"></select>' +
                '</div>' +
                '<div class="event-select-block">' +
                '<label for="staff-select" class="event-label">職員名</label>' +
                '<select id="staff-select" class="event-select"></select>' +
                '</div>' +
                '</div>' +
                '</div>';
        }

        if (!shouldHideQuantitySelector) {
            quantitySectionHtml =
                '<div class="quantity-adjust">' +
                '<span class="section-label">個数選択</span>' +
                '<div class="quantity-controls">' +
                '<button id="quantity-minus" class="quantity-btn" type="button">-</button>' +
                '<input type="number" id="quantity" min="1" value="1" class="quantity-input">' +
                '<button id="quantity-plus" class="quantity-btn" type="button">+</button>' +
                '</div>' +
                '</div>';
        }
        productDetail.innerHTML =
            modeBannerHtml +
            '<div class="product-header">' +
            '<div class="product-info">' +
            '<span class="category-label">' + (item.product.category_name || '-') + '</span>' +
            '<h1 class="product-name">' + (item.product.product_name || '-') + '</h1>' +
            '</div>' +
            '<button id="clear-product" class="clear-btn">CLEAR</button>' +
            '</div>' +
            '<div class="product-tags">' +
            '<span class="tag maker">コード: ' + (item.product.product_cd || '-') + '</span>' +
            '<span class="tag id">メーカー: ' + (item.product.maker_name || '-') + '</span>' +
            '<span class="tag id">現在庫: ' + currentStockText + '</span>' +
            '</div>' +
            '<div class="product-info-block">' +
            '<span class="section-label">製品情報</span>' +
            '<p class="product-info-text">' + productInfoText + '</p>' +
            '</div>' +
            eventInputSectionHtml +
            quantitySectionHtml +
            '</div>';

        document.getElementById('clear-product').addEventListener('click', function () {
            currentProduct = null;
            renderDefaultPlaceholder();
        });

        var quantityMinusBtn = document.getElementById('quantity-minus');
        if (quantityMinusBtn) {
            quantityMinusBtn.addEventListener('click', function () {
                var input = document.getElementById('quantity');
                var value = parseInt(input.value, 10) || 1;
                input.value = Math.max(1, value - 1);
            });
        }

        var quantityPlusBtn = document.getElementById('quantity-plus');
        if (quantityPlusBtn) {
            quantityPlusBtn.addEventListener('click', function () {
                var input = document.getElementById('quantity');
                var value = parseInt(input.value, 10) || 1;
                input.value = value + 1;
            });
        }

        var quantityInput = document.getElementById('quantity');
        if (quantityInput) {
            quantityInput.addEventListener('input', function () {
                var v = parseInt(quantityInput.value, 10);
                if (!v || v < 1) quantityInput.value = 1;
            });
        }

        bindPurchaseModeButton();
        if (!isPurchaseMode) {
            renderDepartmentSelect();
            renderStaffSelect();
        }
        updateRegistrationFlowState();
    }

    function renderDepartmentSelect() {
        var departmentSelect = document.getElementById('department-select');
        if (!departmentSelect) return;

        departmentSelect.innerHTML = '';
        departmentSelect.removeAttribute('size');
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '部署を選択してください';
        departmentSelect.appendChild(defaultOpt);

        for (var i = 0; i < departments.length; i++) {
            var dep = departments[i];
            var opt = document.createElement('option');
            opt.value = dep.id;
            opt.textContent = dep.name + ' (' + dep.id + ')';
            if (selectedDepartment === dep.id) opt.selected = true;
            departmentSelect.appendChild(opt);
        }

        departmentSelect.onchange = function () {
            selectedDepartment = departmentSelect.value;
            var filteredStaffs = getFilteredStaffs();
            var staffStillValid = filteredStaffs.some(function (staff) {
                return staff.id === selectedStaff;
            });
            if (!staffStillValid) selectedStaff = '';
            renderStaffSelect();
            updateRegistrationFlowState();
        };
    }

    function renderStaffSelect() {
        var staffSelect = document.getElementById('staff-select');
        if (!staffSelect) return;

        staffSelect.innerHTML = '';
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '職員を選択してください';
        staffSelect.appendChild(defaultOpt);

        var filteredStaffs = getFilteredStaffs();
        var canChooseStaff = !!selectedDepartment;

        for (var i = 0; i < filteredStaffs.length; i++) {
            var staff = filteredStaffs[i];
            var opt = document.createElement('option');
            opt.value = staff.id;
            opt.textContent = staff.name + ' (' + staff.id + ')';
            if (selectedStaff === staff.id) opt.selected = true;
            staffSelect.appendChild(opt);
        }

        staffSelect.disabled = !canChooseStaff;
        if (!canChooseStaff) {
            defaultOpt.textContent = '先に部署を選択してください';
            staffSelect.removeAttribute('size');
        } else if (filteredStaffs.length === 0) {
            defaultOpt.textContent = 'この部署に所属する職員がいません';
        } else {
            staffSelect.removeAttribute('size');
        }

        staffSelect.onchange = function () {
            selectedStaff = staffSelect.value;
            updateRegistrationFlowState();
        };
    }

    function loadDepartments() {
        requestJSON('/api/departments', {}, function (data) {
            departments = data || [];
            renderDepartmentSelect();
        }, function () {
            showNotification('部署マスタの取得に失敗しました', 'out');
        });
    }

    function loadStaffs() {
        requestJSON('/api/staffs', {}, function (data) {
            staffs = data || [];
            renderStaffSelect();
        }, function () {
            showNotification('職員マスタの取得に失敗しました', 'out');
        });
    }

    function closeConfirmModal() {
        if (!confirmModal) return;
        confirmModal.classList.remove('visible');
        confirmModal.setAttribute('aria-hidden', 'true');
        pendingUpdate = null;
        isSubmittingUpdate = false;
        if (confirmYesBtn) confirmYesBtn.disabled = false;
        if (confirmNoBtn) confirmNoBtn.disabled = false;
    }

    function resetScreenState() {
        selectedCategory = '';
        selectedMaker = '';
        selectedDepartment = '';
        selectedStaff = '';
        currentProduct = null;
        currentPhase = 'category';
        makers = [];
        inventoryItems = [];

        if (barcodeInput) barcodeInput.value = '';

        renderCategorySelect();
        renderMakerSelect();
        renderDeviceList();
        renderDefaultPlaceholder();
        updateRegistrationFlowState();
    }

    function openConfirmModal(action) {
        if (!currentProduct) {
            showNotification('製品を選択してください', 'out');
            return;
        }

        var currentStock = Number(currentProduct.stock_quantity || 0);
        var currentCategoryName = currentProduct.product ? (currentProduct.product.category_name || '') : '';
        var isUniqueBarcodeCategory = shouldShowStockStatusByCategory(currentCategoryName);

        if (action === 'in' && isUniqueBarcodeCategory && currentStock > 0) {
            showNotification('このカテゴリは在庫ありの場合、入庫できません', 'out');
            return;
        }

        if (action === 'out' && currentStock <= 0) {
            showNotification('在庫なし（0在庫）のため出庫できません', 'out');
            return;
        }

        var quantityInput = document.getElementById('quantity');
        var quantity = quantityInput ? parseInt(quantityInput.value, 10) || 1 : 1;
        quantity = Math.max(1, quantity);

        var departmentSelect = document.getElementById('department-select');
        var staffSelect = document.getElementById('staff-select');
        var departmentId = departmentSelect ? departmentSelect.value : '';
        var staffId = staffSelect ? staffSelect.value : '';

        if (action === 'purchase') {
            departmentId = '';
            staffId = '';
        } else {
            if (!departmentId) {
                showNotification('部署を選択してください', 'out');
                return;
            }

            selectedDepartment = departmentId;
            selectedStaff = staffId;
            updateRegistrationFlowState();
        }

        var actionLabel = getActionLabel(action);

        var depLabel = (departmentSelect && departmentSelect.selectedIndex >= 0)
            ? departmentSelect.options[departmentSelect.selectedIndex].text
            : '';
        var staffLabel = (staffId && staffSelect && staffSelect.selectedIndex >= 0)
            ? staffSelect.options[staffSelect.selectedIndex].text
            : '';

        pendingUpdate = {
            action: action,
            quantity: quantity,
            departmentId: departmentId,
            staffId: staffId,
            requestId: createRequestId()
        };

        if (confirmMessage) {
            confirmMessage.innerHTML =
                '製品: ' + (currentProduct.product.product_name || '-') + '<br>' +
                'バーコード: ' + (currentProduct.product.product_cd || '-') + '<br>' +
                'イベント: ' + actionLabel + '<br>' +
                '数量: ' + quantity + '<br>' +
                (action !== 'purchase' ? ('部署: ' + depLabel + '<br>') : '') +
                (action !== 'purchase' && staffLabel ? ('職員: ' + staffLabel + '<br>') : '') +
                '<br>' +
                '登録しますか？';
        }

        if (confirmModal) {
            confirmModal.classList.add('visible');
            confirmModal.setAttribute('aria-hidden', 'false');
        }
    }

    function loadCategories() {
        requestJSON('/api/categories', {}, function (data) {
            categories = data || [];
            currentPhase = 'category';
            selectedCategory = '';
            selectedMaker = '';
            renderCategorySelect();
            renderMakerSelect();
            renderDeviceList();
        }, function () {
            showNotification('カテゴリの取得に失敗しました', 'out');
        });
    }

    function loadMakers(categoryId) {
        requestJSON('/api/makers?category_id=' + encodeURIComponent(categoryId), {}, function (data) {
            makers = data || [];
            renderMakerSelect();
            renderDeviceList();
        }, function () {
            showNotification('メーカーの取得に失敗しました', 'out');
        });
    }

    function loadInventory(categoryId, makerId) {
        var url = '/api/inventory?category_id=' + encodeURIComponent(categoryId) + '&maker_id=' + encodeURIComponent(makerId);
        requestJSON(url, {}, function (data) {
            inventoryItems = data || [];
            renderDeviceList();
        }, function () {
            showNotification('在庫一覧の取得に失敗しました', 'out');
        });
    }

    function updateStock(action, quantity, departmentId, staffId, requestId) {
        requestJSON('/api/inventory/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                product_cd: currentProduct.product.product_cd,
                action: action,
                quantity: quantity,
                department_id: departmentId,
                staff_id: staffId,
                request_id: requestId
            })
        }, function () {
            isSubmittingUpdate = false;
            var actionLabel = getActionLabel(action);
            var noticeType = (action === 'in' || action === 'purchase') ? 'in' : 'out';
            showNotification((currentProduct.product.product_name || '-') + ' を ' + quantity + '個 ' + actionLabel + 'しました。', noticeType);
            closeConfirmModal();
            resetScreenState();
        }, function (err) {
            isSubmittingUpdate = false;
            if (confirmYesBtn) confirmYesBtn.disabled = false;
            if (confirmNoBtn) confirmNoBtn.disabled = false;
            var msg = (err && err.error) ? err.error : '更新に失敗しました';
            showNotification(msg, 'out');
        });
    }

    function searchByBarcode() {
        var barcode = normalizeBarcodeInput(barcodeInput.value);
        if (!barcode) {
            showNotification('バーコードを入力してください', 'out');
            return;
        }
        requestJSON('/api/barcode/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ barcode: barcode })
        }, function (item) {
            selectProduct(item);
        }, function (err) {
            var msg = (err && err.error) ? err.error : '製品が見つかりません';
            showNotification(msg, 'out');
        });
    }

    buildBarcodeNumpad();
    setActionButtonVisible(stockInBtn, true);
    setActionButtonVisible(stockOutBtn, true);
    setActionButtonVisible(stockDisposeBtn, true);
    setActionButtonVisible(stockPurchaseBtn, false);

    for (var t = 0; t < listTabButtons.length; t++) {
        listTabButtons[t].addEventListener('click', function (event) {
            var target = event.currentTarget;
            if (!target || !target.dataset) return;
            setActiveListTab(target.dataset.listTab || 'main');
        });
    }
    setActiveListTab('main');

    barcodeInput.addEventListener('focus', showBarcodeNumpad);
    barcodeInput.addEventListener('click', showBarcodeNumpad);
    barcodeInput.addEventListener('touchstart', showBarcodeNumpad, { passive: true });

    document.addEventListener('mousedown', function (event) {
        if (!numpadRoot || !numpadRoot.classList.contains('visible')) return;
        var target = event.target;
        if (!(target instanceof Node)) return;
        if (target === barcodeInput || barcodeInput.contains(target) || numpadRoot.contains(target)) return;
        hideBarcodeNumpad();
    });

    document.addEventListener('touchstart', function (event) {
        if (!numpadRoot || !numpadRoot.classList.contains('visible')) return;
        var target = event.target;
        if (!(target instanceof Node)) return;
        if (target === barcodeInput || barcodeInput.contains(target) || numpadRoot.contains(target)) return;
        hideBarcodeNumpad();
    }, { passive: true });

    searchBarcodeBtn.addEventListener('click', function () {
        hideBarcodeNumpad();
        searchByBarcode();
    });
    barcodeInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') searchByBarcode();
    });
    stockInBtn.addEventListener('click', function () { openConfirmModal('in'); });
    stockOutBtn.addEventListener('click', function () { openConfirmModal('out'); });
    if (stockDisposeBtn) {
        stockDisposeBtn.addEventListener('click', function () { openConfirmModal('dispose'); });
    }
    if (stockPurchaseBtn) {
        stockPurchaseBtn.addEventListener('click', function () { openConfirmModal('purchase'); });
    }

    if (confirmNoBtn) {
        confirmNoBtn.addEventListener('click', closeConfirmModal);
    }
    if (confirmYesBtn) {
        confirmYesBtn.addEventListener('click', function () {
            if (isSubmittingUpdate) {
                return;
            }
            if (!pendingUpdate || !currentProduct) {
                closeConfirmModal();
                return;
            }
            isSubmittingUpdate = true;
            confirmYesBtn.disabled = true;
            if (confirmNoBtn) confirmNoBtn.disabled = true;
            updateStock(
                pendingUpdate.action,
                pendingUpdate.quantity,
                pendingUpdate.departmentId,
                pendingUpdate.staffId,
                pendingUpdate.requestId
            );
        });
    }
    if (confirmModal) {
        confirmModal.addEventListener('click', function (e) {
            if (e.target === confirmModal) closeConfirmModal();
        });
    }

    loadDepartments();
    loadStaffs();

    updateRegistrationFlowState();
    renderDefaultPlaceholder();
    loadCategories();
});