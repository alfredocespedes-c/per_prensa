"""Presentación en consola. Separado a propósito de la extracción y de la escritura.

Todo lo que se imprime sale por stdout; el log técnico va por stderr (registro.py). Así
`docker compose run ... > informe.txt` guarda el resultado sin mezclarlo con el log.

Los DESCARTADOS se imprimen igual que los aceptados, y eso es deliberado: un filtro que
rechaza en silencio es indistinguible de un filtro roto. Si mañana el proveedor cambia la
dirección desde la que envía, lo que se ve es «descartado: remitente no autorizado» y no
un «0 boletines» sin explicación.
"""
ANCHO = 78


def encabezado(query: str, zona: str, ingesta: bool) -> None:
    print("=" * ANCHO)
    print("Boletín contratado · lectura desde Gmail")
    print(f"Búsqueda : {query}")
    print(f"Zona     : {zona}")
    print(f"Ingesta  : {'sí, a boletines_contratados' if ingesta else 'no (solo listar)'}")
    print("=" * ANCHO)


def detectados(boletines) -> None:
    if not boletines:
        return
    print()
    print(f"{'FECHA':12} {'DOCUMENTO':11} ENLACE")
    print("-" * ANCHO)
    for boletin in boletines:
        print(f"{boletin.fecha.isoformat():12} {boletin.documento_id:11} {boletin.url}")


def descartados(pares) -> None:
    if not pares:
        return
    print()
    print("DESCARTADOS")
    print("-" * ANCHO)
    for correo, motivo in pares:
        fecha = correo.fecha.strftime("%d/%m/%Y") if correo.fecha else "sin fecha"
        print(f"  {fecha}  {correo.asunto[:38]:38}  {motivo}")


def resumen_sin_ingesta(total: int) -> None:
    print()
    print("=" * ANCHO)
    print(
        f"{total} boletín(es) detectado(s). Sin ingesta: no se escribió en la base "
        "(defina DATABASE_HOST para activarla)."
    )
    print("=" * ANCHO)


def resumen_ingesta(total: int, resultado) -> None:
    print()
    print("=" * ANCHO)
    if total == 0:
        print("No se detectó ningún boletín. Nada que guardar.")
    else:
        print(f"{total} boletín(es) detectado(s) → {resultado}.")
        if resultado.sin_cambio:
            print(
                "  «sin cambio» = ya estaba idéntico, o lo corrigió un administrador a "
                "mano y no se pisa."
            )
    print("=" * ANCHO)


def secciones(entradas) -> None:
    """Desglose por sección de los boletines cuyo documento se acaba de procesar.

    Se imprime aunque nadie lo lea a diario: es lo que permite ver de un vistazo que el
    formato del proveedor sigue siendo el esperado. Un día que aparezca «0 noticias» en
    un tipo que siempre trae veinte, el problema se ve acá y no tres semanas después.
    """
    for fecha, resumen, total in entradas:
        print()
        print(f"Desglose del boletín del {fecha.isoformat()} ({total} noticias)")
        print("-" * ANCHO)
        for concepto, tipo, cuantas in resumen:
            print(f"  {concepto:20} / {tipo:12} {cuantas:4}")
