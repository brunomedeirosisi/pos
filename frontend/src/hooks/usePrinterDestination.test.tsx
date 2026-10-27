import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrinterDestination } from './usePrinterDestination';
const store='2269aa2f-39cd-4c5e-807a-a192f9efb987', printer='31aa33a9-90eb-4a22-b97d-b278b7a2b551';
function Probe(){const value=usePrinterDestination();return <output>{JSON.stringify({id:value.printerId,canPrint:value.canPrint})}</output>;}
function render(enabled:boolean){
  vi.stubGlobal('window',{localStorage:{getItem:()=>printer}});
  const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
  client.setQueryData(['print-printers'],{mode:'queue',store_id:store,printers:[{id:'principal',enabled:true,online:true,display_name:'Principal'},{id:printer,enabled,online:false,display_name:'Terminal'}]});
  try{return renderToStaticMarkup(<QueryClientProvider client={client}><Probe/></QueryClientProvider>);}
  finally{client.clear();}
}
afterEach(()=>vi.unstubAllGlobals());
describe('checkout destination before the first print',()=>{
  it('uses the Terminal binding on the first render and permits its offline queue',()=>{
    const html=render(true);expect(html).toContain(printer);expect(html).toContain('&quot;canPrint&quot;:true');
  });
  it('blocks a revoked saved printer without silently selecting the enabled Principal',()=>{
    const html=render(false);expect(html).toContain(printer);expect(html).toContain('&quot;canPrint&quot;:false');
  });
});
