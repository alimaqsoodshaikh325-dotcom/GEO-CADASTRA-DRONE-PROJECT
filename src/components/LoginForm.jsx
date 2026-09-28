import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import PasswordInput from './PasswordInput'
import AuthButton from './AuthButton'
import SocialLogin from './SocialLogin'
import { mockAuth } from '../utils/mockAuth'

const validEmail = value => /^\S+@\S+\.\S+$/.test(value)

function ResetModal({ onClose }) {
  const [email, setEmail] = useState(''), [error, setError] = useState(''), [submitted, setSubmitted] = useState(false)
  const submit = event => { event.preventDefault(); if (!validEmail(email)) { setError('Enter a valid email address.'); return } setError(''); setSubmitted(true) }
  return <motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={onClose}><motion.section className="reset-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title" initial={{opacity:0,scale:.96,y:12}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.96,y:12}} onMouseDown={event=>event.stopPropagation()}><button className="modal-close" onClick={onClose} aria-label="Close password reset">x</button><p className="eyebrow">Password assistance</p><h2 id="reset-title">Reset your password</h2><p>Enter your account email to prepare a reset request.</p>{submitted ? <div className="auth-message" role="status">Password reset functionality will be connected to the authentication service.</div> : <form onSubmit={submit} noValidate><label className="field"><span>Email</span><div className={`input-wrap ${error?'input-wrap--error':''}`}><input autoFocus value={email} onChange={event=>setEmail(event.target.value)} type="email" placeholder="Enter your email"/></div>{error&&<small role="alert">{error}</small>}</label><AuthButton type="submit">Continue <span>-&gt;</span></AuthButton></form>}</motion.section></motion.div>
}

export default function LoginForm({ navigate }) {
  const [email,setEmail] = useState(''), [password,setPassword] = useState(''), [remember,setRemember] = useState(false)
  const [errors,setErrors] = useState({}), [loading,setLoading] = useState(false), [message,setMessage] = useState(''), [shake,setShake] = useState(false), [success,setSuccess] = useState(false), [resetOpen,setResetOpen] = useState(false)
  const submit = async event => {
    event.preventDefault()
    const next = {}
    if (!email.trim()) next.email = 'Email or username is required.'
    else if (!validEmail(email)) next.email = 'Enter a valid email address.'
    if (!password) next.password = 'Password is required.'
    setErrors(next); setMessage('')
    if (Object.keys(next).length) { setShake(true); return }
    setLoading(true)
    await new Promise(resolve => setTimeout(resolve, 650))
    try {
      mockAuth.signIn({ email, password, remember })
      setSuccess(true)
      setMessage('Demo login successful. Opening your workspace...')
      setTimeout(() => navigate('/dashboard'), 550)
    } catch (error) { setErrors({ form: error.message }); setShake(true) } finally { setLoading(false) }
  }
  const unavailable = text => { setMessage(text); setErrors({}); setSuccess(false) }
  return <><motion.section initial={{opacity:0,scale:.97,y:14}} animate={shake?{opacity:1,scale:1,y:0,x:[0,-10,10,-7,7,0]}:{opacity:1,scale:1,y:0,x:0}} onAnimationComplete={()=>setShake(false)} transition={{duration:.42}} className="login-card"><button className="auth-brand" onClick={()=>navigate('/')}><span>&#9671;</span>GEOCADASTRA <em>AI</em></button><h1>{success?'Access granted':'Welcome back'}</h1><p>{success?'Your demonstration workspace is ready.':'Sign in to continue to your cadastral intelligence workspace.'}</p><form onSubmit={submit} noValidate><motion.label initial={{opacity:0,x:12}} animate={{opacity:1,x:0}} transition={{delay:.15}} className="field"><span>Email / Username</span><div className={`input-wrap ${errors.email?'input-wrap--error':''}`}><input required value={email} onChange={event=>setEmail(event.target.value)} type="email" placeholder="Enter your email" autoComplete="email"/></div>{errors.email&&<small role="alert">{errors.email}</small>}</motion.label><motion.div initial={{opacity:0,x:12}} animate={{opacity:1,x:0}} transition={{delay:.22}}><PasswordInput value={password} onChange={setPassword} error={errors.password}/><div className="form-options"><label><input type="checkbox" checked={remember} onChange={event=>setRemember(event.target.checked)}/>Remember me</label><button type="button" onClick={()=>setResetOpen(true)}>Forgot password?</button></div></motion.div>{errors.form&&<div className="auth-message auth-message--error" role="alert">{errors.form}</div>}<AuthButton type="submit" loading={loading} disabled={loading || success}>Sign in <span>-&gt;</span></AuthButton></form>{message&&<div className="auth-message" role="status">{message}</div>}<SocialLogin onUnavailable={unavailable}/><div className="account-prompt">Don't have an account? <button onClick={()=>navigate('/register')}>Create account</button></div><div className="secure-line">&#9678;&nbsp; Secure access to your mapping workspace</div></motion.section><AnimatePresence>{resetOpen&&<ResetModal onClose={()=>setResetOpen(false)}/>}</AnimatePresence></>
}
