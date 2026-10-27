export interface PromoCardConfig {
  enabled: boolean;
  title: string;
  badge: string;
  description: string;
  buttonText: string;
  buttonLink: string;
  gridPosition: number; // 1-based position in grid (e.g. 3 means after product 3)
  theme: "black" | "gradient" | "street" | "image";
  imageUrl: string;
}

export const DEFAULT_PROMO_CONFIG: PromoCardConfig = {
  enabled: true,
  title: "BLACK FRIDAY",
  badge: "",
  description: "Up to 50% off select streetwear, joggers, and signature pieces.",
  buttonText: "ENTER NOW",
  buttonLink: "/products",
  gridPosition: 3,
  theme: "black",
  imageUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&fit=crop",
};

export const PROMO_STORAGE_KEY = "boojy_promo_card_config";
