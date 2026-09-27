const iconModules = import.meta.glob('../icons/*.svg', { query: '?raw', import: 'default', eager: true })

const icons = Object.fromEntries(
  Object.entries(iconModules).map(([path, src]) => [path.match(/([^/]+)\.svg$/)[1], src]),
)

export default function Icon({ name, className = 'w-5 h-5', ...props }) {
  const svg = icons[name]
  if (!svg) return null
  return (
    <span
      className={`inline-flex shrink-0 ${className}`}
      style={{ lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: svg }}
      {...props}
    />
  )
}
