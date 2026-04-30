/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string;
  name: string;
  category: string;
  manufacturer: string;
}

export const PRODUCTS: Record<string, Product> = {
  "490001": {
    id: "490001",
    name: "Wireless Mouse M100",
    category: "Peripheral",
    manufacturer: "Logitech-like"
  },
  "490002": {
    id: "490002",
    name: "Cat6 LAN Cable 3m",
    category: "ケーブル (Cable)",
    manufacturer: "Generic"
  },
  "490003": {
    id: "490003",
    name: "HDMI 2.1 Cable 2m",
    category: "ケーブル (Cable)",
    manufacturer: "UltraConnect"
  },
  "490004": {
    id: "490004",
    name: "AA Alkaline Batteries (4-pack)",
    category: "消耗品 (Consumables)",
    manufacturer: "PowerLife"
  },
  "490005": {
    id: "490005",
    name: "Mechanical Keyboard TKL",
    category: "PC関係機器",
    manufacturer: "KeyMaster"
  },
  "490006": {
    id: "490006",
    name: "USB-C to USB-A Adapter",
    category: "Adapter",
    manufacturer: "LinkPlus"
  },
  "490007": {
    id: "490007",
    name: "24-inch Monitor Full HD",
    category: "モニター (Monitor)",
    manufacturer: "ViewSharp"
  }
};

export const CONSUMABLES = [
  { id: "490001", label: "マウス", icon: "Mouse" },
  { id: "490002", label: "LANケーブル", icon: "Network" },
  { id: "490003", label: "HDMIケーブル", icon: "Cable" },
  { id: "490004", label: "電池", icon: "Battery" },
];
