// Selector de icono de página: emojis (con búsqueda en español), símbolos de color o imagen propia.
import { useEffect, useMemo, useState } from 'react';
import { Shuffle, Upload, Trash2 } from 'lucide-react';
import { elegirArchivo, guardarArchivo } from '../data/archivos';
import type { ColorEtiqueta, Icono } from '../data/tipos';
import { Flotante, type Ancla } from './ui';
import { SIMBOLOS, SIMBOLOS_EN } from './simbolos';
import { ImagenEmoji, useEmojisPropios } from './EmojiPropio';
import { leerLocal, guardarLocal } from '../data/bd';
import { NOMBRE_COLOR } from '../bd/operaciones';
import { segunIdioma, trad } from '../i18n';

interface DatosEmoji {
  categories: { id: string; emojis: string[] }[];
  emojis: Record<string, { id: string; name: string; keywords: string[]; skins: { native: string }[] }>;
}

const CATEGORIAS: Record<string, string> = {
  people: trad('Caras y personas'),
  nature: trad('Animales y naturaleza'),
  foods: trad('Comida y bebida'),
  activity: trad('Actividades'),
  places: trad('Viajes y lugares'),
  objects: trad('Objetos'),
  symbols: trad('Símbolos'),
  flags: trad('Banderas'),
};

// Palabras en español que apuntan a palabras clave en inglés del catálogo.
const ES: Record<string, string> = {
  corazon: 'heart', estrella: 'star', libro: 'book', libros: 'books', casa: 'house', hogar: 'house', fuego: 'fire',
  cohete: 'rocket', sol: 'sun', luna: 'moon', flor: 'flower', arbol: 'tree', perro: 'dog', gato: 'cat',
  dinero: 'money', plata: 'money', trabajo: 'briefcase', musica: 'music', comida: 'food', cafe: 'coffee',
  idea: 'bulb', bombillo: 'bulb', calendario: 'calendar', nota: 'memo', notas: 'memo', lapiz: 'pencil',
  reloj: 'clock', foto: 'camera', camara: 'camera', viaje: 'airplane', avion: 'airplane', carro: 'car',
  auto: 'car', mundo: 'globe', escuela: 'school', feliz: 'smile', triste: 'sad', risa: 'joy', fiesta: 'party',
  regalo: 'gift', alerta: 'warning', objetivo: 'dart', meta: 'dart', trofeo: 'trophy', computador: 'computer',
  computadora: 'computer', telefono: 'phone', celular: 'phone', correo: 'envelope', tienda: 'shop',
  compras: 'shopping', mapa: 'map', montana: 'mountain', playa: 'beach', agua: 'water', planta: 'plant',
  hoja: 'leaf', fruta: 'fruit', manzana: 'apple', fuerza: 'muscle', gimnasio: 'muscle', bandera: 'flag',
  check: 'check', listo: 'check', hecho: 'check', ok: 'ok', pregunta: 'question', mano: 'hand', ojo: 'eye',
  cerebro: 'brain', salud: 'hospital', medico: 'health', bebe: 'baby', familia: 'family', amor: 'love',
  candado: 'lock', llave: 'key', herramienta: 'wrench', grafica: 'chart', datos: 'chart', carpeta: 'folder',
  archivo: 'file', caja: 'package', paquete: 'package', pin: 'pushpin', tarea: 'check', alfiler: 'pushpin',
  rayo: 'zap', energia: 'zap', nube: 'cloud', lluvia: 'rain', nieve: 'snow', mar: 'ocean', pez: 'fish',
  pajaro: 'bird', mariposa: 'butterfly', arte: 'art', pintura: 'art', cine: 'movie', pelicula: 'movie',
  juego: 'game', futbol: 'soccer', bici: 'bike', bicicleta: 'bike', cumpleanos: 'birthday', pastel: 'cake',
};

const quitarTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const COLORES: ColorEtiqueta[] = ['gris', 'marron', 'naranja', 'amarillo', 'verde', 'azul', 'morado', 'rosa', 'rojo'];

let datosCache: DatosEmoji | null = null;
function useDatosEmoji() {
  const [datos, setDatos] = useState<DatosEmoji | null>(datosCache);
  useEffect(() => {
    if (datosCache) return;
    import('@emoji-mart/data/sets/15/native.json').then((m) => {
      datosCache = (m.default ?? m) as unknown as DatosEmoji;
      setDatos(datosCache);
    });
  }, []);
  return datos;
}

export function emojiAlAzar(datos: DatosEmoji | null): string {
  const lista = ['📘', '🧭', '🌱', '🗂️', '🧩', '🪴', '🎯', '📌', '🛠️', '🌙', '🔭', '🧪', '🗺️', '🎨', '📎', '🍋'];
  if (!datos) return lista[Math.floor(Math.random() * lista.length)];
  const cats = datos.categories.filter((c) => c.id === 'nature' || c.id === 'objects' || c.id === 'foods' || c.id === 'activity');
  const cat = cats[Math.floor(Math.random() * cats.length)];
  const id = cat.emojis[Math.floor(Math.random() * cat.emojis.length)];
  return datos.emojis[id]?.skins[0]?.native ?? '📘';
}

export function SelectorIcono(props: {
  ancla: Ancla;
  alCerrar: () => void;
  alElegir: (icono: Icono | null) => void;
  permitirQuitar?: boolean;
}) {
  const datos = useDatosEmoji();
  const [pestana, setPestana] = useState<'emoji' | 'simbolo' | 'subir'>('emoji');
  const [busca, setBusca] = useState('');
  const [color, setColor] = useState<ColorEtiqueta>('azul');
  const [recientes] = useState<string[]>(() => leerLocal('emojisRecientes', []));

  const elegirEmoji = (nativo: string) => {
    guardarLocal('emojisRecientes', [nativo, ...recientes.filter((r) => r !== nativo)].slice(0, 24));
    props.alElegir({ tipo: 'emoji', valor: nativo });
    props.alCerrar();
  };

  const resultados = useMemo(() => {
    if (!datos || !busca.trim()) return null;
    const q = quitarTildes(busca.trim());
    const ingles = ES[q] ?? Object.entries(ES).find(([k]) => k.startsWith(q) && q.length >= 3)?.[1];
    return Object.values(datos.emojis)
      .filter((e) => {
        const texto = `${e.id} ${e.name} ${e.keywords.join(' ')}`.toLowerCase();
        return texto.includes(q) || (ingles && texto.includes(ingles));
      })
      .slice(0, 160);
  }, [datos, busca]);

  const todosPropios = useEmojisPropios();
  const propios = todosPropios.filter((e) => !busca.trim() || e.nombre.includes(quitarTildes(busca.trim())));

  // En inglés también se busca por el nombre en inglés del símbolo.
  const simbolos = Object.entries(SIMBOLOS).filter(([n]) => !busca.trim() || n.includes(quitarTildes(busca.trim())) || (SIMBOLOS_EN[n] ?? '').includes(quitarTildes(busca.trim())));

  return (
    <Flotante ancla={props.ancla} alCerrar={props.alCerrar} ancho={372} className="selector-icono">
      <div className="pestanas" role="tablist">
        {(
          [
            ['emoji', trad('Emoji')],
            ['simbolo', trad('Símbolos')],
            ['subir', trad('Imagen')],
          ] as const
        ).map(([id, nombre]) => (
          <button key={id} role="tab" aria-selected={pestana === id} className="pestana" onClick={() => setPestana(id)}>
            {nombre}
          </button>
        ))}
        <span className="espaciador" />
        {props.permitirQuitar && (
          <button
            className="boton-texto"
            onClick={() => {
              props.alElegir(null);
              props.alCerrar();
            }}
          >
            <Trash2 size={14} /> {trad('Quitar')}
          </button>
        )}
      </div>

      {pestana !== 'subir' && (
        <div className="selector-busca">
          <input
            autoFocus
            className="campo"
            placeholder={pestana === 'emoji' ? trad('Buscar emoji (ej. libro, sol, meta)') : trad('Buscar símbolo')}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {pestana === 'emoji' && (
            <button className="boton-icono" title={trad('Emoji al azar')} aria-label={trad('Emoji al azar')} onClick={() => elegirEmoji(emojiAlAzar(datos))}>
              <Shuffle size={16} />
            </button>
          )}
        </div>
      )}

      {pestana === 'emoji' && (
        <div className="rejilla-emoji-cont">
          {propios.length > 0 && (
            <>
              <h4>{trad('Propios')}</h4>
              <div className="rejilla-emoji">
                {propios.map((e) => (
                  <button
                    key={e.id}
                    title={e.nombre}
                    onClick={() => {
                      props.alElegir({ tipo: 'imagen', valor: e.src });
                      props.alCerrar();
                    }}
                  >
                    <ImagenEmoji e={e} tamano={22} />
                  </button>
                ))}
              </div>
            </>
          )}
          {!datos && <p className="vacio-chico">{trad('Cargando emojis…')}</p>}
          {resultados && (
            <div className="rejilla-emoji">
              {resultados.length === 0 && <p className="vacio-chico">{trad('Nada con «{busca}».', { busca })}</p>}
              {resultados.map((e) => (
                <button key={e.id} title={e.name} onClick={() => elegirEmoji(e.skins[0].native)}>
                  {e.skins[0].native}
                </button>
              ))}
            </div>
          )}
          {datos && !resultados && (
            <>
              {recientes.length > 0 && (
                <>
                  <h4>{trad('Recientes')}</h4>
                  <div className="rejilla-emoji">
                    {recientes.map((n) => (
                      <button key={n} onClick={() => elegirEmoji(n)}>
                        {n}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {datos.categories.map((c) => (
                <section key={c.id}>
                  <h4>{CATEGORIAS[c.id] ?? c.id}</h4>
                  <div className="rejilla-emoji">
                    {c.emojis.map((id) => {
                      const e = datos.emojis[id];
                      if (!e) return null;
                      return (
                        <button key={id} title={e.name} onClick={() => elegirEmoji(e.skins[0].native)}>
                          {e.skins[0].native}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </>
          )}
        </div>
      )}

      {pestana === 'simbolo' && (
        <div className="rejilla-emoji-cont">
          <div className="colores-simbolo" role="radiogroup" aria-label={trad('Color del símbolo')}>
            {COLORES.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={color === c}
                aria-label={NOMBRE_COLOR[c] ?? c}
                className={`muestra-color${color === c ? ' activa' : ''}`}
                style={{ background: `var(--e-${c}-t)` }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="rejilla-emoji rejilla-simbolos">
            {simbolos.map(([nombre, S]) => (
              <button
                key={nombre}
                title={segunIdioma(nombre, SIMBOLOS_EN[nombre] ?? nombre)}
                style={{ color: `var(--e-${color}-t)` }}
                onClick={() => {
                  props.alElegir({ tipo: 'simbolo', valor: nombre, color });
                  props.alCerrar();
                }}
              >
                <S size={20} />
              </button>
            ))}
          </div>
        </div>
      )}

      {pestana === 'subir' && (
        <div className="selector-subir">
          <button
            className="boton boton-primario"
            onClick={async () => {
              const f = await elegirArchivo('image/*');
              if (!f) return;
              const ref = await guardarArchivo(f);
              props.alElegir({ tipo: 'imagen', valor: ref });
              props.alCerrar();
            }}
          >
            <Upload size={16} /> {trad('Elegir imagen')}
          </button>
          <p className="ayuda">{trad('Mejor cuadrada, de 280 × 280 px o más. Se guarda en este equipo.')}</p>
        </div>
      )}
    </Flotante>
  );
}
