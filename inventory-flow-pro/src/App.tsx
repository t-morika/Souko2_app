/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Barcode, 
  Camera, 
  Search, 
  Minus, 
  Plus, 
  CheckCircle2, 
  XCircle,
  Mouse,
  Network,
  Cable,
  Battery,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PRODUCTS, CONSUMABLES, type Product } from './data';

// Helper to get iconography
const getIcon = (name: string) => {
  switch (name) {
    case 'Mouse': return <Mouse className="w-8 h-8" />;
    case 'Network': return <Network className="w-8 h-8" />;
    case 'Cable': return <Cable className="w-8 h-8" />;
    case 'Battery': return <Battery className="w-8 h-8" />;
    default: return <Barcode className="w-8 h-8" />;
  }
};

interface Notification {
  id: number;
  message: string;
  type: 'in' | 'out';
}

export default function App() {
  const [barcodeInput, setBarcodeInput] = useState('');
  const [currentProduct, setCurrentProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount for USB barcode reader
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleScan = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    const product = PRODUCTS[trimmed];
    
    if (product) {
      if (currentProduct?.id === product.id) {
        // Continuous scan: count up
        setQuantity(prev => prev + 1);
      } else {
        // Different barcode: switch and reset quantity
        setCurrentProduct(product);
        setQuantity(1);
      }
    } else {
      // Not found - clear or show error
      // In a real app we might show "Unknown Barcode"
    }
    setBarcodeInput('');
  };

  const addNotification = (productName: string, count: number, type: 'in' | 'out') => {
    const id = Date.now();
    const actionStr = type === 'in' ? '入庫' : '出庫';
    const message = `${productName} を ${count}個、${actionStr}しました。`;
    setNotifications(prev => [{ id, message, type }, ...prev].slice(0, 5));
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const handleComplete = (type: 'in' | 'out') => {
    if (!currentProduct) return;
    
    addNotification(currentProduct.name, quantity, type);
    
    // Reset after confirmation
    setCurrentProduct(null);
    setQuantity(1);
    setBarcodeInput('');
    inputRef.current?.focus();
  };

  const handleManualBarcodeInput = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan(barcodeInput);
    }
  };

  return (
    <div className="bg-neutral-950 text-neutral-100 font-sans p-4 md:p-6 flex flex-col gap-4 select-none overflow-hidden h-screen w-screen">
      {/* Header / Input Section */}
      <header className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
        <div className="col-span-1 md:col-span-2 flex flex-col gap-1">
          <label className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 ml-1">
            Barcode Input / Search
          </label>
          <div className="relative group">
            <input
              ref={inputRef}
              type="text"
              value={barcodeInput}
              onChange={(e) => setBarcodeInput(e.target.value)}
              onKeyDown={handleManualBarcodeInput}
              placeholder="バーコードをスキャン または 検索..."
              className="w-full bg-neutral-900 border-2 border-neutral-800 focus:border-blue-500 rounded-xl py-3 px-12 text-lg outline-none transition-all placeholder:text-neutral-700"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 group-focus-within:text-blue-500 w-5 h-5" />
            <button 
              onClick={() => handleScan(barcodeInput)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-neutral-800 hover:bg-neutral-700 p-1.5 rounded-lg transition-colors"
            >
              <Camera className="w-6 h-6 text-neutral-400" />
            </button>
          </div>
        </div>

        <div className="hidden md:flex flex-col justify-end">
          <div className="flex items-center gap-3 bg-neutral-900/50 p-3 rounded-xl border border-neutral-800">
             <div className="p-2 bg-blue-500/10 rounded-full">
                <Barcode className="w-5 h-5 text-blue-500" />
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] text-neutral-500 uppercase font-bold tracking-tighter">Status</span>
                <span className="text-xs font-medium">スキャン待機中...</span>
             </div>
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-hidden">
        {/* Quick Selection Section */}
        <section className="lg:col-span-3 flex flex-col gap-3 min-h-0">
          <h2 className="text-[10px] font-mono uppercase tracking-widest text-neutral-500 ml-1 shrink-0">
            Quick (消耗品)
          </h2>
          <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1 pb-2">
            {CONSUMABLES.map((item) => (
              <motion.button
                key={item.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setCurrentProduct(PRODUCTS[item.id]);
                  setQuantity(1);
                }}
                className={`flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl border-2 transition-all p-2 ${
                  currentProduct?.id === item.id 
                    ? 'bg-blue-600/10 border-blue-500 text-blue-500' 
                    : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800 hover:border-neutral-700'
                }`}
              >
                {getIcon(item.icon)}
                <span className="font-bold text-sm tracking-tight">{item.label}</span>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Info & Quantity Section */}
        <section className="lg:col-span-9 flex flex-col bg-neutral-900/40 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl">
          {currentProduct ? (
            <AnimatePresence mode="wait">
              <motion.div 
                key={currentProduct.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="h-full flex flex-col"
              >
                {/* Product Detail Area - Scrollable if needed */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col gap-6 md:gap-8 min-h-0">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold uppercase tracking-[0.2em] text-blue-500">
                        {currentProduct.category}
                      </span>
                      <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">
                        {currentProduct.name}
                      </h1>
                    </div>
                    <button 
                      onClick={() => setCurrentProduct(null)}
                      className="p-2 text-neutral-600 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-6 h-6" />
                    </button>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 md:gap-3">
                    <div className="px-4 py-1.5 bg-neutral-800 rounded-full text-xs font-bold border border-neutral-700">
                      Maker: {currentProduct.manufacturer}
                    </div>
                    <div className="px-4 py-1.5 bg-neutral-800 rounded-full text-[10px] font-mono border border-neutral-700">
                      ID: {currentProduct.id}
                    </div>
                  </div>

                  {/* Quantity Adjustment */}
                  <div className="flex flex-col gap-3">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Adjust Quantity</span>
                    <div className="flex items-center gap-4 md:gap-6">
                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                        className="w-16 h-16 md:w-20 md:h-20 bg-neutral-800 hover:bg-neutral-700 text-white rounded-2xl border-2 border-neutral-700 flex items-center justify-center transition-colors shadow-lg"
                      >
                        <Minus className="w-8 h-8" />
                      </motion.button>
                      
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          value={quantity}
                          onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                          className="w-24 md:w-32 h-16 md:h-20 bg-transparent text-center text-4xl md:text-5xl font-black outline-none border-b-4 border-neutral-800 focus:border-blue-600 transition-colors"
                        />
                      </div>

                      <motion.button
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setQuantity(q => q + 1)}
                        className="w-16 h-16 md:w-20 md:h-20 bg-neutral-800 hover:bg-neutral-700 text-white rounded-2xl border-2 border-neutral-700 flex items-center justify-center transition-colors shadow-lg"
                      >
                        <Plus className="w-8 h-8" />
                      </motion.button>
                    </div>
                  </div>
                </div>

                {/* Execution Section - Fixed at bottom */}
                <div className="shrink-0 p-6 md:p-8 border-t border-neutral-800 bg-neutral-900/60 backdrop-blur-md">
                  <div className="grid grid-cols-2 gap-4 md:gap-6">
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleComplete('in')}
                      className="flex flex-col items-center justify-center gap-1 h-20 md:h-24 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl shadow-xl shadow-blue-900/30 transition-colors"
                    >
                      <CheckCircle2 className="w-6 h-6 md:w-7 md:h-7" />
                      <span className="font-black text-lg md:text-xl tracking-tight">入庫確定 (IN)</span>
                    </motion.button>
                    
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleComplete('out')}
                      className="flex flex-col items-center justify-center gap-1 h-20 md:h-24 bg-red-600 hover:bg-red-500 text-white rounded-2xl shadow-xl shadow-red-900/30 transition-colors"
                    >
                      <XCircle className="w-6 h-6 md:w-7 md:h-7" />
                      <span className="font-black text-lg md:text-xl tracking-tight">出庫確定 (OUT)</span>
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-neutral-600 gap-4 p-8">
              <div className="relative">
                <Barcode className="w-24 h-24 opacity-10" />
                <motion.div 
                  className="absolute inset-x-0 h-1 bg-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.5)]"
                  animate={{ top: ['10%', '90%', '10%'] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
              <div className="flex flex-col items-center text-center">
                <p className="text-xl font-bold text-neutral-400">スキャンしてください</p>
                <p className="text-sm text-neutral-500 max-w-[240px] mt-2 leading-relaxed">
                  製品バーコードを読み取るか、<br />左のリストから消耗品を選択してください
                </p>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Notifications Portal */}
      <div className="fixed bottom-20 right-4 md:right-8 z-50 flex flex-col gap-3">
        <AnimatePresence>
          {notifications.map((note) => (
            <motion.div
              key={note.id}
              initial={{ x: 200, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 200, opacity: 0 }}
              className={`p-4 rounded-xl shadow-2xl flex items-center gap-3 border-l-4 max-w-[320px] backdrop-blur-xl ${
                note.type === 'in' 
                  ? 'bg-neutral-900/90 border-blue-500 text-blue-50' 
                  : 'bg-neutral-900/90 border-red-500 text-red-50'
              }`}
            >
              <div className={`p-1.5 rounded-lg ${note.type === 'in' ? 'bg-blue-500' : 'bg-red-500'}`}>
                {note.type === 'in' ? <CheckCircle2 className="w-4 h-4 text-white" /> : <AlertCircle className="w-4 h-4 text-white" />}
              </div>
              <span className="font-bold text-xs md:text-sm">{note.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {/* Footer Meta */}
      <footer className="shrink-0 flex justify-between items-center px-1 opacity-20 text-[8px] font-mono uppercase tracking-[0.2em] pb-1">
        <span>System Version 2.4.0</span>
        <span>Warehouse: WH-JP-TYO-001</span>
      </footer>
    </div>
  );
}
