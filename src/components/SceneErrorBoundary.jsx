import { Component } from 'react'

// Un recurso fallido no debe desmontar el resto del altar ni perder el borrador.
export default class SceneErrorBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <mesh>
      <boxGeometry args={[0.3, 0.3, 0.3]} />
      <meshBasicMaterial color="#e8873b" wireframe />
    </mesh>
  }
}
