// Símbolos disponibles como icono de página (familia Lucide, licencia ISC).
import {
  BookOpen, Bookmark, Briefcase, Calendar, Camera, CheckSquare, Coffee, Compass, Flag, Folder, Gift, Globe,
  GraduationCap, Heart, Home, Inbox, Key, Lightbulb, List, Map, Megaphone, MessageCircle, Music, Notebook,
  Palette, PenTool, Phone, PiggyBank, Plane, Rocket, ShoppingCart, Sparkles, Star, Sun, Tag, Target, Timer,
  Trophy, Users, Wallet, Wrench, Zap, Leaf, Dumbbell, Utensils, Car, Film, Code, Layers, Archive,
  type LucideIcon,
} from 'lucide-react';

export const SIMBOLOS: Record<string, LucideIcon> = {
  libro: BookOpen, marcador: Bookmark, maletin: Briefcase, calendario: Calendar, camara: Camera,
  tarea: CheckSquare, cafe: Coffee, brujula: Compass, bandera: Flag, carpeta: Folder, regalo: Gift,
  mundo: Globe, estudio: GraduationCap, corazon: Heart, casa: Home, bandeja: Inbox, llave: Key,
  idea: Lightbulb, lista: List, mapa: Map, anuncio: Megaphone, mensaje: MessageCircle, musica: Music,
  cuaderno: Notebook, paleta: Palette, pluma: PenTool, telefono: Phone, ahorro: PiggyBank, viaje: Plane,
  cohete: Rocket, compras: ShoppingCart, brillo: Sparkles, estrella: Star, sol: Sun, etiqueta: Tag,
  meta: Target, reloj: Timer, trofeo: Trophy, personas: Users, billetera: Wallet, herramienta: Wrench,
  rayo: Zap, hoja: Leaf, gimnasio: Dumbbell, comida: Utensils, auto: Car, cine: Film, codigo: Code,
  capas: Layers, archivo: Archive,
};

/** Nombre en inglés de cada símbolo: se muestra en inglés y sirve para buscarlo (la clave guardada sigue en español). */
export const SIMBOLOS_EN: Record<string, string> = {
  libro: 'book', marcador: 'bookmark', maletin: 'briefcase', calendario: 'calendar', camara: 'camera',
  tarea: 'task', cafe: 'coffee', brujula: 'compass', bandera: 'flag', carpeta: 'folder', regalo: 'gift',
  mundo: 'globe', estudio: 'study', corazon: 'heart', casa: 'home', bandeja: 'inbox', llave: 'key',
  idea: 'idea', lista: 'list', mapa: 'map', anuncio: 'announcement', mensaje: 'message', musica: 'music',
  cuaderno: 'notebook', paleta: 'palette', pluma: 'pen', telefono: 'phone', ahorro: 'savings', viaje: 'travel',
  cohete: 'rocket', compras: 'shopping', brillo: 'sparkles', estrella: 'star', sol: 'sun', etiqueta: 'tag',
  meta: 'goal', reloj: 'timer', trofeo: 'trophy', personas: 'people', billetera: 'wallet', herramienta: 'tool',
  rayo: 'lightning', hoja: 'leaf', gimnasio: 'gym', comida: 'food', auto: 'car', cine: 'film', codigo: 'code',
  capas: 'layers', archivo: 'archive',
};
