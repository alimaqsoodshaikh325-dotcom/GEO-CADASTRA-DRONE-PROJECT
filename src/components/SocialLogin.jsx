export default function SocialLogin({ onUnavailable }) {
  return <><div className="divider"><span>or continue with</span></div><div className="socials"><button type="button" className="social-button" onClick={()=>onUnavailable('Google authentication is not configured yet.')} aria-label="Continue with Google"><b className="google-mark">G</b>Google</button><button type="button" className="social-button" onClick={()=>onUnavailable('Microsoft authentication is not configured yet.')} aria-label="Continue with Microsoft"><b className="ms-mark">&#8862;</b>Microsoft</button></div></>
}
