package ledger

// Category is where a movement counts: income, an expense or a transfer, and
// which kind of each. The user can rename them, add their own and archive
// them; IDs never change.
type Category struct {
	ID    string
	Name  string
	Flow  Flow
	Group string
}

// Group gathers categories of one flow, like "Alimentación" or "Rendimientos".
type Group struct {
	ID   string
	Name string
	Flow Flow
}

// Categories the classifier assigns on its own.
const (
	CategoryFastFood        = "fast-food"
	CategorySalary          = "salary"
	CategoryExtraIncome     = "extra-income"
	CategoryInterestIncome  = "interest-income"
	CategoryDividends       = "dividends"
	CategoryCashback        = "cashback"
	CategoryBankFees        = "bank-fees"
	CategoryInterestCharged = "interest-charged"
	CategoryLoanPayments    = "loan-payments"
	CategoryWithholding     = "withholding"
	CategoryCardPayment     = "card-payment"
	CategoryLoanPayment     = "loan-payment"
	CategoryDisbursement    = "disbursement"
	CategoryCashWithdrawal  = "cash-withdrawal"
	CategoryCashAdvance     = "cash-advance"
	CategoryCashDeposit     = "cash-deposit"
	CategoryReversal        = "reversal"
	CategoryInvestmentIn    = "investment-in"
	CategoryInvestmentOut   = "investment-out"
	CategoryOwnTransfer     = "own-transfer"
	CategoryExchange        = "currency-exchange"

	CategoryInsuranceReimbursement = "insurance-reimbursement"
)

// DefaultGroups come with Domfin, in the order screens list them.
var DefaultGroups = []Group{
	{ID: "work", Name: "Trabajo", Flow: Income},
	{ID: "returns", Name: "Rendimientos", Flow: Income},
	{ID: "other-income", Name: "Otros ingresos", Flow: Income},
	{ID: "food", Name: "Alimentación", Flow: Expense},
	{ID: "transport", Name: "Transporte", Flow: Expense},
	{ID: "home", Name: "Hogar", Flow: Expense},
	{ID: "health", Name: "Salud", Flow: Expense},
	{ID: "shopping", Name: "Compras", Flow: Expense},
	{ID: "lifestyle", Name: "Estilo de vida", Flow: Expense},
	{ID: "travel", Name: "Viajes", Flow: Expense},
	{ID: "education", Name: "Educación", Flow: Expense},
	{ID: "finance", Name: "Finanzas", Flow: Expense},
	{ID: "taxes", Name: "Impuestos", Flow: Expense},
	{ID: "other-expenses", Name: "Otros gastos", Flow: Expense},
	{ID: "transfers", Name: "Transferencias", Flow: Transfer},
}

// DefaultCategories come with Domfin, in the order screens list them.
var DefaultCategories = []Category{
	{ID: CategorySalary, Name: "Salario", Flow: Income, Group: "work"},
	{ID: CategoryExtraIncome, Name: "Ingreso adicional", Flow: Income, Group: "work"},
	{ID: "bonus", Name: "Bonos", Flow: Income, Group: "work"},
	// The share of the profits companies pay by law once a year.
	{ID: "profit-sharing", Name: "Bonificaciones", Flow: Income, Group: "work"},
	{ID: CategoryInterestIncome, Name: "Intereses", Flow: Income, Group: "returns"},
	{ID: CategoryDividends, Name: "Dividendos", Flow: Income, Group: "returns"},
	{ID: "realized-gains", Name: "Ganancias realizadas", Flow: Income, Group: "returns"},
	{ID: "one-off", Name: "Entregas sueltas", Flow: Income, Group: "other-income"},
	// What an insurer pays back of what you paid yourself (a doctor, a clinic).
	{ID: CategoryInsuranceReimbursement, Name: "Reembolsos del seguro", Flow: Income, Group: "other-income"},
	{ID: CategoryCashback, Name: "Cashback", Flow: Income, Group: "other-income"},
	{ID: "other-income", Name: "Otros ingresos", Flow: Income, Group: "other-income"},

	{ID: "groceries", Name: "Supermercado", Flow: Expense, Group: "food"},
	{ID: "restaurants", Name: "Restaurantes", Flow: Expense, Group: "food"},
	{ID: CategoryFastFood, Name: "Comida rápida", Flow: Expense, Group: "food"},
	{ID: "fuel", Name: "Combustible", Flow: Expense, Group: "transport"},
	{ID: "rides", Name: "Taxi y transporte", Flow: Expense, Group: "transport"},
	{ID: "tolls-parking", Name: "Peajes y parqueo", Flow: Expense, Group: "transport"},
	{ID: "car-care", Name: "Mantenimiento del vehículo", Flow: Expense, Group: "transport"},
	{ID: "utilities", Name: "Luz, agua y gas", Flow: Expense, Group: "home"},
	{ID: "telecom", Name: "Internet, TV y teléfono", Flow: Expense, Group: "home"},
	{ID: "home-goods", Name: "Artículos del hogar", Flow: Expense, Group: "home"},
	{ID: "rent", Name: "Alquiler", Flow: Expense, Group: "home"},
	{ID: "pharmacy", Name: "Farmacia", Flow: Expense, Group: "health"},
	{ID: "medical", Name: "Médicos y clínicas", Flow: Expense, Group: "health"},
	{ID: "insurance", Name: "Seguros", Flow: Expense, Group: "health"},
	{ID: "clothing", Name: "Ropa y calzado", Flow: Expense, Group: "shopping"},
	{ID: "electronics", Name: "Electrónica", Flow: Expense, Group: "shopping"},
	{ID: "stores", Name: "Tiendas", Flow: Expense, Group: "shopping"},
	{ID: "shipping", Name: "Envíos y courier", Flow: Expense, Group: "shopping"},
	{ID: "entertainment", Name: "Entretenimiento", Flow: Expense, Group: "lifestyle"},
	{ID: "subscriptions", Name: "Suscripciones", Flow: Expense, Group: "lifestyle"},
	{ID: "fitness", Name: "Gimnasio y deporte", Flow: Expense, Group: "lifestyle"},
	{ID: "personal-care", Name: "Cuidado personal", Flow: Expense, Group: "lifestyle"},
	{ID: "pets", Name: "Mascotas", Flow: Expense, Group: "lifestyle"},
	{ID: "donations", Name: "Donaciones", Flow: Expense, Group: "lifestyle"},
	{ID: "flights", Name: "Vuelos", Flow: Expense, Group: "travel"},
	{ID: "lodging", Name: "Hoteles", Flow: Expense, Group: "travel"},
	{ID: "travel-other", Name: "Agencias y alquiler de vehículos", Flow: Expense, Group: "travel"},
	{ID: "education", Name: "Colegios y cursos", Flow: Expense, Group: "education"},
	{ID: CategoryLoanPayments, Name: "Cuotas de préstamos", Flow: Expense, Group: "finance"},
	{ID: CategoryInterestCharged, Name: "Intereses de tarjetas", Flow: Expense, Group: "finance"},
	{ID: CategoryBankFees, Name: "Comisiones y cargos", Flow: Expense, Group: "finance"},
	{ID: CategoryWithholding, Name: "Retenciones (DGII)", Flow: Expense, Group: "taxes"},
	{ID: "taxes", Name: "Impuestos y trámites", Flow: Expense, Group: "taxes"},
	{ID: CategoryUndetailedCash, Name: "Efectivo sin detallar", Flow: Expense, Group: "other-expenses"},

	{ID: CategoryCardPayment, Name: "Pago de tarjeta", Flow: Transfer, Group: "transfers"},
	{ID: CategoryLoanPayment, Name: "Pago a préstamo", Flow: Transfer, Group: "transfers"},
	{ID: CategoryDisbursement, Name: "Desembolso de préstamo", Flow: Transfer, Group: "transfers"},
	{ID: CategoryCashWithdrawal, Name: "Retiro de efectivo", Flow: Transfer, Group: "transfers"},
	{ID: CategoryCashAdvance, Name: "Avance de efectivo", Flow: Transfer, Group: "transfers"},
	{ID: CategoryCashDeposit, Name: "Depósito de efectivo", Flow: Transfer, Group: "transfers"},
	{ID: CategoryReversal, Name: "Reversos y devoluciones", Flow: Transfer, Group: "transfers"},
	{ID: CategoryInvestmentIn, Name: "Aporte a inversión", Flow: Transfer, Group: "transfers"},
	{ID: CategoryInvestmentOut, Name: "Retiro de inversión", Flow: Transfer, Group: "transfers"},
	{ID: CategoryOwnTransfer, Name: "Entre mis cuentas", Flow: Transfer, Group: "transfers"},
	{ID: CategoryExchange, Name: "Cambio de moneda", Flow: Transfer, Group: "transfers"},
}
