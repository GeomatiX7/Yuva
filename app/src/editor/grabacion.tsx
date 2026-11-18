// Bloque «Grabación» (/grabacion, S3), la alternativa local a las Notas de reunión de Notion: graba el micrófono
// en el equipo (MediaRecorder), guarda el audio con guardarArchivo y lo reproduce. «Marcar momento» escribe
// debajo el minuto transcurrido (de la grabación en curso o del audio que suena) para tomar notas con marcas.
// La transcripción automática no se hace: pide un modelo de voz (Whisper local o un servicio con clave).
import { useEffect, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { Bookmark, Mic, Pause, Play, Square } from 'lucide-react';
import { guardarArchivo, useArchivo } from '../data/archivos';
import { avisar } from '../data/estado';
import '../estilos/agenda.css';
import { LOCALE, trad } from '../i18n';

export function reloj(seg: number): string {
  const s = Math.max(0, Math.floor(seg));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const dos = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${dos(m)}:${dos(s % 60)}` : `${dos(m)}:${dos(s % 60)}`;
}

function tipoAudio(): string {
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  return '';
}

interface Props {
  audio: string;
  duracion: number;
  fecha: number;
  editable: boolean;
  alGuardar: (p: { audio: string; duracion: number; fecha: number }) => void;
  alMarcar: (seg: number) => void;
}

function Grabacion({ audio, duracion, fecha, editable, alGuardar, alMarcar }: Props) {
  const url = useArchivo(audio || null);
  const [estado, setEstado] = useState<'listo' | 'grabando' | 'pausado' | 'guardando'>('listo');
  const [transcurrido, setTranscurrido] = useState(0);
  const [error, setError] = useState('');
  const grabador = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const cuenta = useRef({ desde: 0, acumulado: 0 }); // ms grabados antes de la última pausa
  const reproductor = useRef<HTMLAudioElement | null>(null);

  const segundos = () => (cuenta.current.acumulado + (grabador.current?.state === 'recording' ? Date.now() - cuenta.current.desde : 0)) / 1000;

  useEffect(() => {
    if (estado !== 'grabando') return;
    const t = window.setInterval(() => setTranscurrido(segundos()), 250);
    return () => window.clearInterval(t);
  }, [estado]);

  // Si el bloque desaparece a mitad de una grabación, se suelta el micrófono.
  useEffect(() => () => grabador.current?.stream.getTracks().forEach((p) => p.stop()), []);

  const empezar = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return setError(trad('Este navegador no puede grabar audio.'));
    let flujo: MediaStream;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const nombre = err instanceof DOMException ? err.name : '';
      return setError(nombre === 'NotAllowedError' ? trad('No hay permiso para usar el micrófono. Dalo en el aviso del navegador o en la configuración de privacidad de Windows.') : nombre === 'NotFoundError' ? trad('No se encontró ningún micrófono.') : trad('No se pudo abrir el micrófono.'));
    }
    const mime = tipoAudio();
    const rec = new MediaRecorder(flujo, mime ? { mimeType: mime } : undefined);
    trozos.current = [];
    rec.ondataavailable = (e) => e.data.size && trozos.current.push(e.data);
    rec.onstop = async () => {
      flujo.getTracks().forEach((p) => p.stop());
      const dur = Math.round(cuenta.current.acumulado / 1000);
      const blob = new Blob(trozos.current, { type: rec.mimeType || mime || 'audio/webm' });
      grabador.current = null;
      if (!blob.size) {
        setEstado('listo');
        return;
      }
      setEstado('guardando');
      const ahora = new Date();
      const ext = /ogg/.test(blob.type) ? 'ogg' : /mp4/.test(blob.type) ? 'm4a' : 'webm';
      const nombre = `grabacion-${ahora.toISOString().slice(0, 16).replace(/[T:]/g, '-')}.${ext}`;
      try {
        const ref = await guardarArchivo(new File([blob], nombre, { type: blob.type }));
        alGuardar({ audio: ref, duracion: dur, fecha: ahora.getTime() });
      } catch {
        avisar(trad('No se pudo guardar la grabación.'), { tono: 'error' });
      }
      setEstado('listo');
    };
    grabador.current = rec;
    cuenta.current = { desde: Date.now(), acumulado: 0 };
    setTranscurrido(0);
    rec.start(1000);
    setEstado('grabando');
  };

  const pausar = () => {
    const rec = grabador.current;
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause();
      cuenta.current.acumulado += Date.now() - cuenta.current.desde;
      setEstado('pausado');
    } else if (rec.state === 'paused') {
      rec.resume();
      cuenta.current.desde = Date.now();
      setEstado('grabando');
    }
  };

  const parar = () => {
    const rec = grabador.current;
    if (!rec) return;
    if (rec.state === 'recording') cuenta.current.acumulado += Date.now() - cuenta.current.desde;
    rec.stop();
  };

  const marcar = () => {
    if (grabador.current) alMarcar(segundos());
    else if (reproductor.current) alMarcar(reproductor.current.currentTime);
  };

  const grabando = estado === 'grabando' || estado === 'pausado';
  return (
    <div className="grabacion" contentEditable={false} onMouseDown={(e) => e.stopPropagation()}>
      <div className="grabacion-fila">
        <Mic size={16} />
        <strong>{trad('Grabación')}</strong>
        {audio && !grabando && (
          <small>
            {reloj(duracion)} · {new Date(fecha || Date.now()).toLocaleString(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })}
          </small>
        )}
        {grabando && (
          <>
            {estado === 'grabando' && <span className="grabacion-punto" aria-hidden />}
            <span className="grabacion-tiempo" aria-live="off">
              {reloj(transcurrido)}
            </span>
            <small>{estado === 'pausado' ? trad('En pausa') : trad('Grabando…')}</small>
          </>
        )}
        {estado === 'guardando' && <small>{trad('Guardando…')}</small>}
      </div>
      {audio && !grabando && (url ? <audio ref={reproductor} controls preload="metadata" src={url} /> : <small>{trad('No se encuentra el audio en este equipo.')}</small>)}
      {editable && (
        <div className="grabacion-fila">
          {!audio && estado === 'listo' && (
            <button className="boton chico boton-primario" onClick={empezar}>
              <Mic size={14} /> {trad('Grabar')}
            </button>
          )}
          {grabando && (
            <>
              <button className="boton chico" onClick={pausar}>
                {estado === 'pausado' ? <Play size={14} /> : <Pause size={14} />} {estado === 'pausado' ? trad('Seguir@reanudar') : trad('Pausa')}
              </button>
              <button className="boton chico" onClick={parar}>
                <Square size={14} /> {trad('Terminar')}
              </button>
            </>
          )}
          {(grabando || audio) && (
            <button className="boton chico" onClick={marcar} title={trad('Escribe debajo el minuto actual de la grabación o del audio')}>
              <Bookmark size={14} /> {trad('Marcar momento')}
            </button>
          )}
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!audio && !grabando && editable && <small>{trad('El audio se guarda solo en este equipo. La transcripción automática no está disponible.')}</small>}
    </div>
  );
}

export const bloqueGrabacion = createReactBlockSpec(
  { type: 'grabacion', propSchema: { audio: { default: '' }, duracion: { default: 0 }, fecha: { default: 0 } }, content: 'none' },
  {
    render: ({ block, editor }) => {
      const marcar = (seg: number) => {
        // La marca va debajo del bloque, tras las marcas que ya haya: «⏱ 03:12 — ».
        const doc = editor.document as any[];
        const buscar = (lista: any[]): { lista: any[]; i: number } | null => {
          for (let i = 0; i < lista.length; i++) {
            if (lista[i].id === block.id) return { lista, i };
            const r = buscar(lista[i].children ?? []);
            if (r) return r;
          }
          return null;
        };
        const sitio = buscar(doc);
        let ref = block.id;
        if (sitio) {
          for (let j = sitio.i + 1; j < sitio.lista.length; j++) {
            const b = sitio.lista[j];
            const primero = Array.isArray(b.content) ? b.content[0] : null;
            if (b.type === 'paragraph' && primero?.type === 'text' && primero.text?.startsWith('⏱')) ref = b.id;
            else break;
          }
        }
        const [nuevo] = (editor as any).insertBlocks(
          [{ type: 'paragraph', content: [{ type: 'text', text: `⏱ ${reloj(seg)}`, styles: { bold: true } }, { type: 'text', text: ' — ', styles: {} }] }],
          ref,
          'after',
        );
        if (nuevo) {
          (editor as any).setTextCursorPosition(nuevo.id, 'end');
          editor.focus();
        }
      };
      return (
        <Grabacion
          audio={block.props.audio}
          duracion={block.props.duracion}
          fecha={block.props.fecha}
          editable={editor.isEditable}
          alGuardar={(p) => {
            try {
              editor.updateBlock(block.id, { props: p } as any);
            } catch {
              avisar(trad('La grabación se guardó, pero el bloque ya no estaba.'), { tono: 'error' });
            }
          }}
          alMarcar={marcar}
        />
      );
    },
    toExternalHTML: ({ block }) => <p>🎙 {trad('Grabación ({duracion})', { duracion: reloj(block.props.duracion) })}</p>,
  },
);

/** Plantilla «Reunión»: fecha, asistentes, agenda, grabación, notas con marcas, acuerdos y tareas. */
export function insertarReunion(editor: any) {
  const hoy = new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const titulo = (t: string) => ({ type: 'heading', props: { level: 3 }, content: t });
  const bloques = [
    { type: 'paragraph', content: [{ type: 'text', text: `${trad('Fecha')}: `, styles: { bold: true } }, { type: 'text', text: hoy, styles: {} }] },
    titulo(trad('Asistentes')),
    { type: 'bulletListItem', content: '' },
    titulo(trad('Agenda')),
    { type: 'numberedListItem', content: '' },
    titulo(trad('Grabación')),
    { type: 'grabacion' },
    titulo(trad('Notas')),
    { type: 'paragraph', content: [{ type: 'text', text: trad('Pulsa «Marcar momento» durante la grabación para anotar el minuto de cada tema.'), styles: { italic: true } }] },
    titulo(trad('Acuerdos')),
    { type: 'bulletListItem', content: '' },
    titulo(trad('Tareas')),
    { type: 'checkListItem', content: '' },
  ];
  const actual = editor.getTextCursorPosition().block;
  const vacio = actual.type === 'paragraph' && (!Array.isArray(actual.content) || actual.content.length === 0) && !actual.children?.length;
  const creados = vacio ? editor.replaceBlocks([actual.id], bloques).insertedBlocks : editor.insertBlocks(bloques, actual.id, 'after');
  const asistentes = creados?.[2];
  if (asistentes) editor.setTextCursorPosition(asistentes.id, 'end');
}
