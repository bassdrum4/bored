import THREE_CORE from './vendor/three-core.b64?raw';
import THREE_MOD from './vendor/three-mod.b64?raw';

export function threeBootstrap() {
  return '<scr' + 'ipt>(function(){'
    + 'var dec=function(b){var s=atob(b),a=new Uint8Array(s.length);'
    + 'for(var i=0;i<s.length;i++)a[i]=s.charCodeAt(i);'
    + 'return new TextDecoder("utf-8").decode(a)};'
    + 'var enc=function(s){var a=new TextEncoder().encode(s),o="";'
    + 'for(var i=0;i<a.length;i++)o+=String.fromCharCode(a[i]);return btoa(o)};'
    + 'var core=dec("' + THREE_CORE + '");'
    + 'var mod=dec("' + THREE_MOD + '");'
    + 'var out=[],i,try0=function(f){try{f()}catch(e){}};'
    // blob URLs first (fast, no re-encode); data URIs as the file:// fallback
    + 'try0(function(){var cu=URL.createObjectURL(new Blob([core],{type:"text/javascript"}));'
    + 'out.push(URL.createObjectURL(new Blob([mod.split("./three.core.min.js").join(cu)],{type:"text/javascript"})))});'
    + 'try0(function(){var cd="data:text/javascript;base64,"+enc(core);'
    + 'out.push("data:text/javascript;base64,"+enc(mod.split("./three.core.min.js").join(cd)))});'
    + 'window.__THREE_ENGINE=out;'
    + '})();<\/scr' + 'ipt>';
}
