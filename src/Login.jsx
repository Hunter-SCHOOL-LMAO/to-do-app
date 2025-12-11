import { useEffect, useRef, useState } from 'react';
import firebase, { auth } from './firebase';
import 'firebaseui/dist/firebaseui.css';
import './Login.css';

function Login({ onSignIn }) {
  const uiRef = useRef(null);
  const firebaseUiWidget = useRef(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState({ type: '', message: '' });
  const [isResetting, setIsResetting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Dynamically import firebaseui for Vite compatibility
    const loadFirebaseUI = async () => {
      const firebaseui = await import('firebaseui');
      
      // FirebaseUI configuration
      const uiConfig = {
        signInFlow: 'popup',
        signInOptions: [
          {
            provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
            signInMethod: firebase.auth.EmailAuthProvider.EMAIL_PASSWORD_SIGN_IN_METHOD,
            requireDisplayName: true,
            disableSignUp: {
              status: false // Allow both sign-up and sign-in
            }
          }
        ],
        callbacks: {
          signInSuccessWithAuthResult: (authResult) => {
            if (onSignIn) {
              onSignIn(authResult.user);
            }
            return false; // Don't redirect
          },
          signInFailure: (error) => {
            console.error('Sign-in error:', error);
            return Promise.resolve();
          },
          uiShown: () => {
            setIsLoading(false);
          }
        },
        // Disable credential helpers which can cause issues
        credentialHelper: firebaseui.auth.CredentialHelper.NONE,
        // Don't auto-upgrade anonymous users
        autoUpgradeAnonymousUsers: false
      };

      // Get existing FirebaseUI instance or create new one
      const ui = firebaseui.auth.AuthUI.getInstance() || new firebaseui.auth.AuthUI(auth);
      firebaseUiWidget.current = ui;

      // Start FirebaseUI
      if (uiRef.current) {
        ui.start(uiRef.current, uiConfig);
      }
    };

    loadFirebaseUI();

    // Cleanup
    return () => {
      if (firebaseUiWidget.current) {
        firebaseUiWidget.current.reset();
      }
    };
  }, [onSignIn]);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    
    if (!resetEmail.trim()) {
      setResetStatus({ type: 'error', message: 'Please enter your email address.' });
      return;
    }

    setIsResetting(true);
    setResetStatus({ type: '', message: '' });

    try {
      await auth.sendPasswordResetEmail(resetEmail.trim());
      setResetStatus({ 
        type: 'success', 
        message: 'Password reset email sent! Check your inbox.' 
      });
      setResetEmail('');
      // Close modal after 3 seconds on success
      setTimeout(() => {
        setShowResetModal(false);
        setResetStatus({ type: '', message: '' });
      }, 3000);
    } catch (error) {
      let message = 'An error occurred. Please try again.';
      if (error.code === 'auth/user-not-found') {
        message = 'No account found with this email address.';
      } else if (error.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        message = 'Too many requests. Please try again later.';
      }
      setResetStatus({ type: 'error', message });
    } finally {
      setIsResetting(false);
    }
  };

  const openResetModal = () => {
    setShowResetModal(true);
    setResetEmail('');
    setResetStatus({ type: '', message: '' });
  };

  const closeResetModal = () => {
    setShowResetModal(false);
    setResetEmail('');
    setResetStatus({ type: '', message: '' });
  };

  return (
    <div className="login-page">
      <div className="login-container animate-slide-up">
        <div className="login-header">
          <div className="login-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path 
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1>Welcome Back</h1>
          <p>Sign in to manage your tasks and stay organized</p>
        </div>
        
        <div className="login-form-container">
          {isLoading && (
            <div className="login-loading">
              <div className="loading-spinner"></div>
            </div>
          )}
          <div ref={uiRef} id="firebaseui-auth-container"></div>
        </div>

        <div className="login-footer">
          <button className="forgot-password-link" onClick={openResetModal}>
            Forgot Password?
          </button>
          <p>Killing Procrastination Since 12/11/2025</p>
        </div>
      </div>

      <div className="login-decoration">
        <div className="decoration-circle decoration-circle-1"></div>
        <div className="decoration-circle decoration-circle-2"></div>
        <div className="decoration-circle decoration-circle-3"></div>
      </div>

      {/* Password Reset Modal */}
      {showResetModal && (
        <div className="modal-overlay" onClick={closeResetModal}>
          <div className="modal-content animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeResetModal}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            
            <div className="modal-header">
              <div className="modal-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2>Reset Password</h2>
              <p>Enter your email and we'll send you a link to reset your password.</p>
            </div>

            <form onSubmit={handleResetPassword} className="reset-form">
              <div className="form-group">
                <label htmlFor="reset-email">Email Address</label>
                <input
                  type="email"
                  id="reset-email"
                  className="input"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="Enter your email"
                  disabled={isResetting}
                  autoFocus
                />
              </div>

              {resetStatus.message && (
                <div className={`reset-status ${resetStatus.type}`}>
                  {resetStatus.type === 'success' ? (
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                  <span>{resetStatus.message}</span>
                </div>
              )}

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={closeResetModal} disabled={isResetting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isResetting}>
                  {isResetting ? 'Sending...' : 'Send Reset Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;
