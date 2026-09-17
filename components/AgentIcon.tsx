interface AgentIconProps {
  /** Nombre del agente: tooltip y texto alternativo (también se muestra si falta el icono). */
  name: string;
  icon?: string | null;
  /** Tooltip alternativo (por defecto, el nombre). */
  title?: string;
  className?: string;
}

/**
 * Icono circular del agente sin el nombre al lado: el nombre vive en el tooltip.
 * Si la partida no trae icono (ventanas sin catálogo), cae al nombre en texto.
 */
export function AgentIcon({ name, icon, title, className = 'agent-icon' }: AgentIconProps) {
  if (!icon) {
    return (
      <span className="agent-fallback" title={title ?? name}>
        {name}
      </span>
    );
  }
  return <img className={className} src={icon} alt={name} title={title ?? name} loading="lazy" />;
}
