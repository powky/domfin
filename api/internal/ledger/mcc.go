package ledger

import (
	"strconv"
	"strings"
)

// DefaultMCC gives card purchases a category from their merchant category
// code (MCC), which the Popular prints under each purchase. Codes missing
// here leave the purchase in Sin categoría.
var DefaultMCC = map[string]string{
	// Food.
	"5300": "groceries", // wholesale clubs, like PriceSmart
	"5411": "groceries",
	"5422": "groceries",
	"5441": "groceries",
	"5451": "groceries",
	"5462": "groceries",
	"5499": "groceries",
	"5921": "groceries",
	"5811": "restaurants",
	"5812": "restaurants",
	"5813": "restaurants",
	"5814": CategoryFastFood,
	// Transport.
	"5541": "fuel",
	"5542": "fuel",
	"4111": "rides",
	"4121": "rides",
	"4131": "rides",
	"4789": "rides", // transportation not elsewhere classified: Uber, in the Dominican Republic
	"4784": "tolls-parking",
	"7523": "tolls-parking",
	"5532": "car-care",
	"5533": "car-care",
	"7538": "car-care",
	"7542": "car-care",
	// Home.
	"4900": "utilities",
	"5983": "utilities", // fuel dealers: propane
	"4814": "telecom",
	"4899": "telecom",
	"5200": "home-goods",
	"5211": "home-goods",
	"5251": "home-goods",
	"5712": "home-goods",
	"5719": "home-goods",
	"5722": "home-goods",
	// Health.
	"5912": "pharmacy",
	"8011": "medical",
	"8021": "medical",
	"8042": "medical",
	"8043": "medical",
	"8062": "medical",
	"8071": "medical",
	"8099": "medical",
	"6300": "insurance",
	// Shopping.
	"5611": "clothing",
	"5621": "clothing",
	"5631": "clothing",
	"5641": "clothing",
	"5651": "clothing",
	"5661": "clothing",
	"5691": "clothing",
	"5699": "clothing",
	"5045": "electronics",
	"5732": "electronics",
	"5734": "electronics",
	"5946": "electronics",
	"5310": "stores",
	"5311": "stores",
	"5331": "stores",
	"5399": "stores",
	"5941": "stores",
	"5944": "stores",
	"5945": "stores",
	"5947": "stores",
	"5992": "stores",
	"7338": "stores",
	"5964": "stores",
	"5969": "stores",
	"5999": "stores",
	"4215": "shipping", // couriers that bring online purchases
	// Lifestyle.
	"5735": "entertainment",
	"7832": "entertainment",
	"7922": "entertainment",
	"7991": "entertainment",
	"7994": "entertainment",
	"7996": "entertainment",
	"7999": "entertainment",
	"4816": "subscriptions",
	"5815": "subscriptions",
	"5816": "subscriptions",
	"5817": "subscriptions",
	"5818": "subscriptions",
	"5968": "subscriptions",
	"7372": "subscriptions",
	"7941": "fitness",
	"7997": "fitness",
	"5977": "personal-care",
	"7230": "personal-care",
	"7298": "personal-care",
	"0742": "pets",
	"5995": "pets",
	"8398": "donations",
	// Travel.
	"4511": "flights",
	"7011": "lodging",
	"4411": "travel-other",
	"4722": "travel-other",
	"7512": "travel-other",
	// Education.
	"5942": "education",
	"8211": "education",
	"8220": "education",
	"8241": "education",
	"8244": "education",
	"8249": "education",
	"8299": "education",
	"8351": "education",
	// Taxes and government.
	"9211": "taxes",
	"9222": "taxes",
	"9311": "taxes",
	"9399": "taxes",
}

// namedMerchants are merchants whose code says something else, found by
// their name (letters and digits only) in the merchant or the description.
var namedMerchants = []struct{ name, categoryID string }{
	// Uber Eats charges with Uber's transport codes (4111, 4789).
	{"ubereats", CategoryFastFood},
}

// namedMerchant is where a purchase goes by its merchant's name, or "" when
// its code decides.
func namedMerchant(m Movement) string {
	text := merchantKey(m.Merchant + " " + m.Description)
	for _, n := range namedMerchants {
		if strings.Contains(text, n.name) {
			return n.categoryID
		}
	}
	return ""
}

// mccCategory looks a code up in table, then in the ranges card networks
// reserve for airlines, car rentals and hotels.
func mccCategory(table map[string]string, code string) string {
	if category, ok := table[code]; ok {
		return category
	}
	n, err := strconv.Atoi(code)
	if err != nil {
		return ""
	}
	switch {
	case n >= 3000 && n <= 3299:
		return "flights"
	case n >= 3351 && n <= 3500:
		return "travel-other"
	case n >= 3501 && n <= 3999:
		return "lodging"
	}
	return ""
}
