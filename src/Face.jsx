import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { createFace } from './core.js'
import './face.css'

// <Face expression="curious" size={160} />
//
// Grab a ref to drive it imperatively:
//   const face = useRef(null)
//   face.current.react('bounce')
//   face.current.look(-1, 0)
const Face = forwardRef(function Face(
  {
    size = 140,
    expression = 'idle',
    mouth = false,
    pupils = false,
    track = true,
    blink = true,
    idle = true,
    className = '',
    style,
    ...rest
  },
  ref,
) {
  const host = useRef(null)
  const face = useRef(null)

  // Anything the engine reads once at construction goes in this dep list, so a
  // change rebuilds the SVG. `expression` is *not* one of those — it animates.
  useEffect(() => {
    const instance = createFace(host.current, { expression, mouth, pupils, track, blink, idle })
    face.current = instance
    return () => {
      instance.destroy()
      face.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mouth, pupils, track, blink, idle])

  useEffect(() => {
    face.current?.setExpression(expression)
  }, [expression])

  useImperativeHandle(ref, () => ({
    react: (name, options) => face.current?.react(name, options),
    setExpression: (name) => face.current?.setExpression(name),
    look: (x, y, ms) => face.current?.look(x, y, ms),
  }), [])

  return (
    <div
      ref={host}
      className={`bwface-host ${className}`.trim()}
      style={{ width: size, height: size, ...style }}
      {...rest}
    />
  )
})

export default Face
