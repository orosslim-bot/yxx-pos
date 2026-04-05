export type Category = {
  id: number
  name: string
}

export type Product = {
  id: string
  sku: string | null
  name: string
  category_id: number | null
  categories: { id: number; name: string } | null
  price: number
  cost: number
  stock: number
  low_stock_threshold: number
  image_url: string | null
  image_filename: string | null
  note: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type CartItem = {
  product: {
    id: string
    name: string
    price: number
    image_url: string | null
    stock: number
    low_stock_threshold: number
  }
  quantity: number
}
