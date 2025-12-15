import { useState, useEffect } from 'react';
import { auth } from './firebase';
import Login from './Login';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for auth state changes
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

  const handleSignOut = async () => {
    try {
      await auth.signOut();
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const handleSignIn = (signedInUser) => {
    setUser(signedInUser);
  };

  // Show loading state
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!user) {
    return <Login onSignIn={handleSignIn} />;
  }

  // Main app content when authenticated
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-title">
            <div className="app-icon">
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
            <h1>My Tasks</h1>
          </div>
          <div className="header-user">
            <span className="user-greeting">
              Hello, {user.displayName || user.email?.split('@')[0]}
            </span>
            <button className="btn btn-ghost" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="container">
          <div className="welcome-card card animate-slide-up">
            <div className="welcome-icon">✨</div>
            <h2>Welcome to Your To-Do App!</h2>
            <p>
              You're signed in as <strong>{user.email}</strong>. 
              Start adding tasks to stay organized and productive.
            </p>
            <div className="coming-soon">
              <span>Task management features coming soon...</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
