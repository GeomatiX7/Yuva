// Une los diccionarios de inglés de todas las zonas. Si dos zonas traducen igual una clave, no pasa nada;
// si la traducen distinto, gana la primera de la lista y el revisor (app/herramientas/revisar-traducciones.cjs) lo avisa.
import { en as comun } from './comun';
import { en as componentes } from './componentes';
import { en as ajustes } from './ajustes';
import { en as bd } from './bd';
import { en as editor } from './editor';
import { en as lib } from './lib';
import { en as plantillasTrabajo } from './plantillas-trabajo';
import { en as plantillasPersonales } from './plantillas-personales';

export const ZONAS = { comun, componentes, ajustes, bd, editor, lib, plantillasTrabajo, plantillasPersonales };
export const EN: Record<string, string> = Object.assign({}, ...Object.values(ZONAS).reverse());
