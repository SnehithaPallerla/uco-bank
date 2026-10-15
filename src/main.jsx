import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
class Boundary extends React.Component{
 constructor(p){super(p);this.state={error:null};}
 static getDerivedStateFromError(error){return {error};}
 render(){return this.state.error?<main style={{padding:40,fontFamily:'sans-serif'}}><h1>The workspace could not render</h1><p>{String(this.state.error.message)}</p><button onClick={()=>{try{localStorage.removeItem('uco-credit-intelligence-v4');}catch{}location.reload();}}>Reset offline workspace</button></main>:this.props.children;}
}
createRoot(document.getElementById('root')).render(<Boundary><App/></Boundary>);
