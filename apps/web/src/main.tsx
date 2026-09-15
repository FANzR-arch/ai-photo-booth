import React from 'react';
import { createRoot } from 'react-dom/client';
import { Booth, Pickup } from './Booth';
import { Admin } from './Admin';
import './styles.css';
import './editorial.css';
import './theme-gallery.css';
const path = location.pathname;
createRoot(document.getElementById('root')!).render(path.startsWith('/pickup/') ? <Pickup /> : path === '/admin' ? <Admin /> : <Booth />);
