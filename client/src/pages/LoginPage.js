import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';
import { FiMail, FiLock, FiEye, FiEyeOff } from 'react-icons/fi';
import { motion } from 'framer-motion';
import '../styles/AuthPages.css';

function LoginPage() {
  const navigate = useNavigate();
  const { login, resetPassword } = useAuthStore();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetData, setResetData] = useState({ newPassword: '', confirmPassword: '' });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.email?.trim() || !formData.password) {
      toast.error('Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      await login(formData.email.trim(), formData.password);
      toast.success('Login successful!');
      navigate('/chats');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!formData.email?.trim()) {
      toast.error('Enter your email or username first');
      return;
    }
    if (!resetData.newPassword || resetData.newPassword !== resetData.confirmPassword) {
      toast.error('Passwords must match (min 6 characters)');
      return;
    }
    setIsLoading(true);
    try {
      const result = await resetPassword(
        formData.email.trim(),
        resetData.newPassword,
        resetData.confirmPassword
      );
      toast.success(result.message || 'Password updated! Log in now.');
      setShowReset(false);
      setResetData({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      toast.error(error.response?.data?.message || 'Reset failed');
    } finally {
      setIsLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, y: 50 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } 
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <motion.div 
          className="auth-card"
          initial="hidden"
          animate="visible"
          variants={containerVariants}
        >
          <div className="auth-header">
            <h1>Messenger</h1>
            <p>Welcome back</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            <motion.div className="form-group"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              <label htmlFor="email">Email or Username</label>
              <div className="input-wrapper">
                <FiMail className="input-icon" />
                <input
                  type="text"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="Email or username"
                  disabled={isLoading}
                  autoComplete="username"
                />
              </div>
            </motion.div>

            <motion.div className="form-group"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <FiLock className="input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter your password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </motion.div>

            <motion.button
              type="submit"
              className="submit-btn"
              disabled={isLoading}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              whileTap={{ scale: 0.98 }}
            >
              {isLoading ? 'Logging in...' : 'Login'}
            </motion.button>

            <button
              type="button"
              className="forgot-password-link"
              onClick={() => setShowReset(!showReset)}
              disabled={isLoading}
            >
              {showReset ? 'Back to login' : 'Forgot password?'}
            </button>
          </form>

          {showReset && (
            <form onSubmit={handleResetPassword} className="auth-form reset-form">
              <p className="reset-hint">
                Set a new password for your account. Use the same email or username as above.
              </p>
              <div className="form-group">
                <label>New Password</label>
                <div className="input-wrapper">
                  <FiLock className="input-icon" />
                  <input
                    type="password"
                    value={resetData.newPassword}
                    onChange={(e) => setResetData((p) => ({ ...p, newPassword: e.target.value }))}
                    placeholder="Min 6 characters"
                    minLength={6}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Confirm Password</label>
                <div className="input-wrapper">
                  <FiLock className="input-icon" />
                  <input
                    type="password"
                    value={resetData.confirmPassword}
                    onChange={(e) => setResetData((p) => ({ ...p, confirmPassword: e.target.value }))}
                    placeholder="Confirm password"
                    minLength={6}
                    required
                  />
                </div>
              </div>
              <button type="submit" className="submit-btn secondary" disabled={isLoading}>
                {isLoading ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          )}

          <motion.div 
            className="auth-footer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
          >
            <p>
              Don't have an account?{' '}
              <Link to="/register">Register here</Link>
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

export default LoginPage;