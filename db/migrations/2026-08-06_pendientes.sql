-- El "asistente que toma nota": una fila por cada cosa que llegó por WhatsApp
-- y que alguien del equipo tiene que resolver a mano (comprobante de pago,
-- pedido específico de otra tienda, o mensaje que nadie contestó a tiempo).
-- Ver docs/PLAN.md para el diseño completo.
--
-- La IA (clasificador, B3) solo INSERTA aquí. Nunca aprueba, nunca contesta,
-- nunca borra. Todo lo demás lo hace una persona desde /admin/pendientes.
--
-- Correr una sola vez en el SQL editor de Supabase antes de desplegar
-- app/admin/pendientes, app/api/pendientes y app/api/whatsapp/webhook.

create table pendientes (
  id uuid primary key default gen_random_uuid(),

  -- 'comprobante': transferencia/depósito que alguien debe conciliar.
  -- 'pedido_especifico': encargo de otra tienda que alguien debe cotizar.
  -- 'sin_responder': el cliente escribió y nadie contestó en 15 min dentro
  --                  del horario de atención (L-V 10-7pm, sáb 10-5pm).
  tipo text not null check (tipo in ('comprobante', 'pedido_especifico', 'sin_responder')),

  -- 'nuevo': nadie lo ha visto todavía.
  -- 'visto': alguien apretó "Yo lo veo" (candado, evita que el otro lo repita).
  -- 'resuelto': ya se atendió — conciliado, cotizado o contestado.
  estado text not null default 'nuevo' check (estado in ('nuevo', 'visto', 'resuelto')),

  -- Vínculo al cliente si su número de WhatsApp coincide con clientes.telefono.
  -- Si no coincide (cliente nuevo, número no registrado) queda en null y se
  -- usa telefono_whatsapp/nombre_whatsapp para identificarlo igual.
  cliente_id uuid references clientes(id),
  telefono_whatsapp text not null,
  nombre_whatsapp text,

  -- Lo que anota la IA, en una línea, para leer la lista sin abrir el chat.
  resumen text not null,
  -- Datos estructurados según el tipo: banco/referencia/ordenante para
  -- comprobante; marca/modelo/talla/color/cantidad para pedido específico.
  detalle jsonb,

  -- Solo aplica a tipo = 'comprobante'.
  monto numeric(10,2),
  -- true cuando el monto detectado no cuadra con lo que debe el cliente
  -- (parcial, de más, o dos pedidos juntos). Siempre pasa a revisión manual,
  -- la IA nunca decide cuál es el caso — ver docs/PLAN.md §9.
  monto_no_coincide boolean not null default false,
  imagen_url text,

  -- ID del mensaje de WhatsApp que originó el pendiente. Único: si Meta
  -- reenvía el mismo webhook (pasa seguido), no se duplica la fila.
  mensaje_wa_id text,

  -- Quién lo tomó ("Yo lo veo") y quién lo cerró ("Listo"). Ambos son filas
  -- de clientes con rol admin/vendedor — el mismo staff que usa el POS.
  atendido_por uuid references clientes(id),
  atendido_en timestamptz,
  resuelto_por uuid references clientes(id),
  resuelto_en timestamptz,

  creado_en timestamptz not null default now()
);

create index idx_pendientes_estado on pendientes(estado, creado_en desc);
create index idx_pendientes_telefono on pendientes(telefono_whatsapp);
create index idx_pendientes_cliente on pendientes(cliente_id);

-- Idempotencia: un mismo mensaje de WhatsApp nunca genera dos pendientes.
create unique index idx_pendientes_mensaje_wa_id on pendientes(mensaje_wa_id) where mensaje_wa_id is not null;

grant select, insert, update, delete on pendientes to anon, authenticated, service_role;

-- RLS activado, sin políticas: solo la llave de servicio (que usan las
-- rutas de app/api/pendientes) puede leer/escribir. Guarda teléfonos y
-- montos de clientes — no debe quedar abierta a la llave pública del sitio.
alter table pendientes enable row level security;
