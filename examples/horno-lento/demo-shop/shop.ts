import { defineShop } from "../../shops/types";

export default defineShop({
  name: "Horno Lento",
  shortName: "Horno Lento",
  kind: "Pastelería y café",
  tagline: "Pastelería de masa madre y tortas por encargo",
  description: "Pastelería de masa madre, café de especialidad y tortas por encargo en Rosario. Elegí, pagá online y retirá.",

  address: "Las Acacias 1380, Rosario",
  neighborhood: "Fisherton",
  mapsUrl: "https://www.google.com/maps/search/?api=1&query=Las+Acacias+1380+Rosario+Santa+Fe",
  locations: [
    {
      name: "Fisherton",
      address: "Las Acacias 1380, Rosario",
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Las+Acacias+1380+Rosario+Santa+Fe",
    },
    {
      name: "Centro",
      address: "Pasaje Los Tilos 455, Rosario",
      mapsUrl: "https://www.google.com/maps/search/?api=1&query=Pasaje+Los+Tilos+455+Rosario+Santa+Fe",
    },
  ],
  whatsapp: "5493415550182",
  instagram: "https://www.instagram.com/hornolento.ros",
  googleRating: 4.8,

  wordmark: { src: "/shops/horno-lento/wordmark.png", width: 317, height: 195 },
  cover: "/shops/horno-lento/cover.webp",
  coverAlt: "Vitrina de la pastelería con facturas y panes recién horneados",

  theme: {
    brand: "#8a4b1e",
    brandInk: "#6b3714",
    blush: "#f5e6d6",
    cream: "#fbf6ee",
    ink: "#2b1d14",
    muted: "#7a6553",
    line: "#eadbc8",
  },

  hours: {
    lunes: null,
    martes: [8, 20],
    miercoles: [8, 20],
    jueves: [8, 20],
    viernes: [8, 20],
    sabado: [8, 20],
    domingo: [8, 20],
  },

  home: {
    title: ["Tortas hechas ", "sin apuro", "."],
    intro: "Masa madre, manteca de verdad y fermentaciones largas. Tomá un café en el salón o encargá tu torta online y retirala en Fisherton o en el Centro.",
    featured: ["Torta mousse de chocolate", "Cheesecake de frutos rojos", "Lemon pie", "Pavlova de frutillas", "Carrot cake", "Torta de dulce de leche y caramelo"],
  },

  salon: {
    name: "Menú",
    summary: "Café de especialidad, desayunos, tostados y pastelería de vitrina",
  },

  orders: {
    item: { one: "torta", other: "tortas", feminine: true },
    title: "Tortas por encargo",
    leadTimeHours: 24,
    payment: "mercadopago",
    referencePrefix: "HL",
    cta: "Encargar una torta",
    sizeLegend: "Tamaño del molde",
    sizeNotes: { "18cm": "≈ 8 porciones", "24cm": "≈ 14 porciones", "20cm": "≈ 8 porciones", "26cm": "≈ 14 porciones", "22cm": "≈ 8 porciones", "28cm": "≈ 14 porciones" },
    notesPlaceholder: "Ej: escribir “Feliz cumple, Sofi” en la torta…",
    salonUpsell: "¿Te llevás una torta entera?",
  },

  admin: true,
});
