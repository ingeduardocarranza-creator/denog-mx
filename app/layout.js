import { Geist, Geist_Mono, Fredoka, Plus_Jakarta_Sans, Baloo_2, Poppins } from "next/font/google";
import "./globals.css";
import FloatingSocialBar from "./components/FloatingSocialBar";

const fredoka = Fredoka({
  variable: "--font-fredoka",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Tipografía exclusiva de la sección Mercadito (catálogo/carrito/checkout
// del cliente), distinta del resto del sistema — ver handoff de diseño.
const baloo2 = Baloo_2({
  variable: "--font-baloo2",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: 'Denog USA Compras',
  description: 'Sistema de gestión Denog',
  icons: {
    icon: [
      { url: '/icon.png', sizes: '256x256' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: '/apple-icon.png',
  },
  other: {
    // Comprueba ante Meta que denog.mx es nuestro. Requisito para la
    // verificación del negocio, que a su vez es prerequisito de los permisos
    // de la API de WhatsApp. Meta lee esta etiqueta del HTML servido, así que
    // tiene que salir en el <head> del render del servidor — no la muevas a
    // un componente de cliente. Ver docs/TICKET_META.md.
    'facebook-domain-verification': 'blwyu8tnhwipg3rmz9fmv8959cedzv',
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fredoka.variable} ${plusJakarta.variable} ${baloo2.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <FloatingSocialBar />
      </body>
    </html>
  );
}
