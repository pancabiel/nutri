import { createContext, useCallback, useContext, useState } from "react";
import { api } from "../lib/api.js";

const Ctx = createContext(null);

export function StoreProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [comidas, setComidas] = useState([]);

  // type: "success" (default, green check) | "error" (red, longer dwell so the user reads it).
  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), type === "error" ? 4000 : 2200);
  }, []);

  const refreshProdutos = useCallback(async () => setProdutos(await api.produtos.list()), []);
  const refreshComidas  = useCallback(async () => setComidas(await api.comidas.list()), []);

  return (
    <Ctx.Provider value={{ produtos, comidas, refreshProdutos, refreshComidas, toast, showToast, setProdutos, setComidas }}>
      {children}
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);
