import ParticleBackground from './ParticleBackground'
import GravitationalVortex from './GravitationalVortex'
import UrbanNetwork from './UrbanNetwork'
export default function AuthBackground(){return <aside className="auth-visual"><ParticleBackground/><GravitationalVortex compact/><UrbanNetwork className="auth-network"/><div className="auth-visual-copy"><p className="eyebrow">Intelligent urban mapping</p><h2>From aerial imagery<br/>to <span>intelligent city insights.</span></h2><p>Spatial intelligence, quietly working in the background.</p></div><div className="auth-coordinates">18.5204° N&nbsp;&nbsp; 73.8567° E<br/><span>LIVE MAPPING SIGNAL</span></div></aside>}
