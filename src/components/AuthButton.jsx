import { motion } from 'framer-motion'
export default function AuthButton({ children, loading, ...props }) { return <motion.button whileHover={!props.disabled?{y:-2}:undefined} whileTap={!props.disabled?{scale:.98}:undefined} className="auth-button" {...props}>{loading?<><i className="spinner"/>Connecting securely…</>:children}</motion.button> }
