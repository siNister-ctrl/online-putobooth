import '../styles/globals.css';
import { useEffect } from 'react';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Socket will init per-page
  }, []);
  return <Component {...pageProps} />;
}
