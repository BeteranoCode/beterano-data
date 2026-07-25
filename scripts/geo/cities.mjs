// Ciudades curadas por país (grafía local, la que espera el usuario y la que
// suele venir en los anuncios). Alcance: países donde opera Beterano. El resto
// de países del catálogo ISO quedan sin ciudades por ahora — la estructura
// per-país (cities/<code>.json) está lista para ampliar.
//
// Fuente de autoría de las ciudades. `bake-geo.mjs` la lee (o el xlsx si existe)
// y hornea datasets/geo/cities/<code>.json. Editable a mano o en Excel.

export const CITIES_BY_COUNTRY = {
  // --- España: 50 capitales de provincia + Ceuta/Melilla + grandes ciudades ---
  ES: [
    "A Coruña", "Albacete", "Alicante", "Almería", "Ávila", "Badajoz", "Barcelona",
    "Bilbao", "Burgos", "Cáceres", "Cádiz", "Castellón de la Plana", "Ceuta",
    "Ciudad Real", "Córdoba", "Cuenca", "Girona", "Granada", "Guadalajara", "Huelva",
    "Huesca", "Jaén", "Las Palmas de Gran Canaria", "León", "Lleida", "Logroño",
    "Lugo", "Madrid", "Málaga", "Melilla", "Murcia", "Ourense", "Oviedo", "Palencia",
    "Palma", "Pamplona", "Pontevedra", "Salamanca", "San Sebastián", "Santander",
    "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria", "Tarragona", "Teruel",
    "Toledo", "Valencia", "Valladolid", "Vitoria-Gasteiz", "Zamora", "Zaragoza",
    // grandes ciudades no capitales
    "Vigo", "Gijón", "L'Hospitalet de Llobregat", "Móstoles", "Getafe", "Cartagena",
    "Jerez de la Frontera", "Sabadell", "Terrassa", "Marbella", "Alcalá de Henares",
    "Fuenlabrada", "Elche", "Leganés", "Badalona", "Dos Hermanas", "Mataró",
  ],
  // --- Portugal: capitales de distrito + grandes ciudades ---
  PT: [
    "Lisboa", "Porto", "Vila Nova de Gaia", "Amadora", "Braga", "Coimbra", "Funchal",
    "Setúbal", "Almada", "Aveiro", "Faro", "Évora", "Guarda", "Leiria", "Viseu",
    "Viana do Castelo", "Vila Real", "Bragança", "Castelo Branco", "Portalegre",
    "Beja", "Santarém", "Ponta Delgada", "Angra do Heroísmo", "Guimarães", "Cascais",
  ],
  // --- Francia: mayores ciudades ---
  FR: [
    "Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Montpellier",
    "Strasbourg", "Bordeaux", "Lille", "Rennes", "Reims", "Le Havre", "Saint-Étienne",
    "Toulon", "Grenoble", "Dijon", "Angers", "Nîmes", "Villeurbanne", "Clermont-Ferrand",
    "Le Mans", "Aix-en-Provence", "Brest", "Tours", "Amiens", "Limoges", "Annecy",
    "Perpignan", "Metz", "Besançon", "Orléans", "Rouen", "Mulhouse", "Caen", "Nancy",
  ],
  // --- Alemania: mayores ciudades ---
  DE: [
    "Berlin", "Hamburg", "München", "Köln", "Frankfurt am Main", "Stuttgart",
    "Düsseldorf", "Leipzig", "Dortmund", "Essen", "Bremen", "Dresden", "Hannover",
    "Nürnberg", "Duisburg", "Bochum", "Wuppertal", "Bielefeld", "Bonn", "Münster",
    "Karlsruhe", "Mannheim", "Augsburg", "Wiesbaden", "Mönchengladbach", "Gelsenkirchen",
    "Braunschweig", "Kiel", "Aachen", "Freiburg im Breisgau", "Krefeld", "Mainz",
    "Lübeck", "Erfurt", "Rostock", "Kassel", "Saarbrücken", "Regensburg",
  ],
  // --- Austria: capitales de estado + ciudades ---
  AT: [
    "Wien", "Graz", "Linz", "Salzburg", "Innsbruck", "Klagenfurt", "Villach", "Wels",
    "Sankt Pölten", "Dornbirn", "Wiener Neustadt", "Steyr", "Feldkirch", "Bregenz",
    "Leonding", "Baden", "Wolfsberg", "Leoben", "Krems an der Donau", "Eisenstadt",
  ],
  // --- Italia: capoluoghi y grandes ciudades ---
  IT: [
    "Roma", "Milano", "Napoli", "Torino", "Palermo", "Genova", "Bologna", "Firenze",
    "Bari", "Catania", "Venezia", "Verona", "Messina", "Padova", "Trieste", "Brescia",
    "Parma", "Taranto", "Prato", "Modena", "Reggio Calabria", "Reggio Emilia",
    "Perugia", "Livorno", "Ravenna", "Cagliari", "Foggia", "Rimini", "Salerno",
    "Ferrara", "Sassari", "Latina", "Monza", "Bergamo", "Pescara", "Vicenza",
    "Bolzano", "Novara", "Ancona", "Lecce", "La Spezia",
  ],
  // --- Países Bajos ---
  NL: [
    "Amsterdam", "Rotterdam", "Den Haag", "Utrecht", "Eindhoven", "Groningen", "Tilburg",
    "Almere", "Breda", "Nijmegen", "Enschede", "Haarlem", "Arnhem", "Zaanstad",
    "Amersfoort", "Apeldoorn", "'s-Hertogenbosch", "Maastricht", "Leiden", "Dordrecht",
  ],
  // --- Bélgica ---
  BE: [
    "Bruxelles", "Antwerpen", "Gent", "Charleroi", "Liège", "Brugge", "Namur", "Leuven",
    "Mons", "Aalst", "Mechelen", "La Louvière", "Kortrijk", "Hasselt", "Oostende",
    "Tournai", "Genk", "Seraing", "Roeselare", "Verviers",
  ],
  // --- Suiza ---
  CH: [
    "Zürich", "Genève", "Basel", "Bern", "Lausanne", "Winterthur", "Luzern",
    "Sankt Gallen", "Lugano", "Biel/Bienne", "Thun", "Köniz", "La Chaux-de-Fonds",
    "Fribourg", "Schaffhausen", "Chur", "Neuchâtel", "Sion", "Uster", "Zug",
  ],
  // --- Reino Unido ---
  GB: [
    "London", "Birmingham", "Manchester", "Glasgow", "Liverpool", "Leeds", "Sheffield",
    "Edinburgh", "Bristol", "Cardiff", "Belfast", "Leicester", "Coventry", "Nottingham",
    "Newcastle upon Tyne", "Brighton", "Kingston upon Hull", "Plymouth", "Stoke-on-Trent",
    "Wolverhampton", "Derby", "Southampton", "Portsmouth", "Aberdeen", "Dundee",
    "Reading", "Preston", "Milton Keynes", "Norwich", "Oxford", "Cambridge", "York",
  ],
};
