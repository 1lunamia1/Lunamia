if (!window.LUNAMIA_CONFIG?.SUPABASE_URL && !window.LUNAMIA_CONFIG?.SUPABASE_ANON_KEY && !window.LUNAMIA_CONFIG?.SUPABASE_PUBLISHABLE_KEY) {
window.LUNAMIA_INITIAL_DB = {
  productos: [
    {
      id: 1,
      nombre: "Remera Demo Classic",
      marca: "Demo",
      tipo: "classic",
      codigo: "REM-DEM-CLS-001",
      cat: "Remeras",
      gen: "Dama",
      costo: 5000,
      gan: 120,
      precio: 10990,
      provId: 1,
      conjuntoId: "DEMO-SET-1",
      tipoConjunto: "REMERA",
      variantes: [
        { c: "Negro", t: "S", stock: 6, cod: "REM-DEM-CLS-001-NEG-S" },
        { c: "Blanco", t: "M", stock: 4, cod: "REM-DEM-CLS-001-BLA-M" }
      ]
    },
    {
      id: 2,
      nombre: "Short Demo Relax",
      marca: "Demo",
      tipo: "relax",
      codigo: "PAN-DEM-RLX-001",
      cat: "Pantalones",
      gen: "Dama",
      costo: 7000,
      gan: 115,
      precio: 14990,
      provId: 1,
      conjuntoId: "DEMO-SET-1",
      tipoConjunto: "SHORT",
      variantes: [
        { c: "Negro", t: "S", stock: 5, cod: "PAN-DEM-RLX-001-NEG-S" },
        { c: "Beige", t: "M", stock: 3, cod: "PAN-DEM-RLX-001-BEI-M" }
      ]
    },
    {
      id: 3,
      nombre: "Buzo Demo Urban",
      marca: "Demo",
      tipo: "urban",
      codigo: "BUZ-DEM-URB-001",
      cat: "Buzos",
      gen: "Caballero",
      costo: 12000,
      gan: 110,
      precio: 24990,
      provId: 2,
      variantes: [
        { c: "Gris", t: "L", stock: 2, cod: "BUZ-DEM-URB-001-GRI-L" },
        { c: "Azul", t: "XL", stock: 2, cod: "BUZ-DEM-URB-001-AZU-XL" }
      ]
    },
    {
      id: 4,
      nombre: "Campera Demo Norte",
      marca: "Demo",
      tipo: "norte",
      codigo: "CAM-DEM-NOR-001",
      cat: "Camperas",
      gen: "Caballero",
      costo: 20000,
      gan: 100,
      precio: 39990,
      provId: 2,
      variantes: [
        { c: "Negro", t: "M", stock: 1, cod: "CAM-DEM-NOR-001-NEG-M" }
      ]
    }
  ],
  categorias: [
    { id: 1, codigo: "REM", nombre: "Remeras" },
    { id: 2, codigo: "PAN", nombre: "Pantalones" },
    { id: 3, codigo: "BUZ", nombre: "Buzos" },
    { id: 4, codigo: "CAM", nombre: "Camperas" }
  ],
  clientes: [
    {
      id: 1,
      nombre: "Cliente Demo",
      tel: "260-000-0001",
      dir: "Direccion demo",
      obs: "Datos ficticios para pruebas locales.",
      registro: "01/06/2026",
      estado: "ok",
      deuda: 0,
      limite: 50000,
      saldoFavor: 0,
      puntos: 0,
      nivel: "Nuevo",
      comprasTotal: 0,
      vence: "—",
      diasPlazo: 30,
      historial: []
    },
    {
      id: 2,
      nombre: "Cliente Cta Cte Demo",
      tel: "260-000-0002",
      dir: "Direccion demo",
      obs: "Tiene deuda ficticia.",
      registro: "02/06/2026",
      estado: "proximo",
      deuda: 15000,
      limite: 60000,
      saldoFavor: 0,
      puntos: 30,
      nivel: "Nuevo",
      comprasTotal: 30000,
      vence: "30/06/2026",
      diasPlazo: 30,
      historial: [
        { fecha: "02/06", concepto: "Saldo demo inicial", monto: 15000, tipo: "cargo", pts: 0 }
      ]
    }
  ],
  cajas: {
    principal: { efectivo: 50000, mercadopago: 25000, debito: 0, credito: 0 },
    reinversion: { efectivo: 10000, mercadopago: 0, debito: 0, credito: 0 }
  },
  movimientos: [
    { id: 1, fecha: "01/06", fechaISO: "2026-06-01", hora: "09:00", tipo: "apertura", concepto: "Saldo demo inicial", caja: "principal", medio: "efectivo", monto: 50000, signo: 1 }
  ],
  gastos: [],
  transferencias: [],
  ventas: [],
  devoluciones: [],
  proveedores: [
    { id: 1, nombre: "Proveedor Demo Textil", rubro: "Ropa dama", tel: "260-000-0101", ig: "@proveedordemo", dir: "Mendoza", dias: "lunes", obs: "Ficticio", activo: true, prodIds: [1, 2], compras: [] },
    { id: 2, nombre: "Proveedor Demo Urbano", rubro: "Ropa caballero", tel: "260-000-0102", ig: "@urbanodemo", dir: "Mendoza", dias: "martes", obs: "Ficticio", activo: true, prodIds: [3, 4], compras: [] }
  ],
  cierres: [],
  analytics: { reposicion: [], oferta: [] },
  meta: { fuente: "Demo local ficticia" }
};
}
