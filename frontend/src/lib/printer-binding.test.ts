import { describe, expect, it } from 'vitest';
import { availablePrinter, capturePrinterBinding, readPrinterBinding, savePrinterBinding } from './printer-binding';
const storeA='59fe743e-a2fc-414b-9725-f3f589148d44', storeB='e1b8b811-f17b-4d46-bdaf-313b93f3a655', printer='53ed27aa-8fe5-4ee6-9c99-657f5d69363b';
function storage() {
  const values=new Map<string,string>();
  return { setItem: (key:string,value:string)=>{values.set(key,value);}, getItem: (key:string)=>values.get(key) ?? null };
}
describe('checkout printer destination binding',()=>{
  it('captures a shortcut before login and persists only public store/printer identifiers',()=>{
    const data=storage();
    capturePrinterBinding('https://store.example.test/?pos_store='+storeA+'&pos_printer='+printer,data);
    expect(readPrinterBinding(storeA,data)).toBe(printer);
    expect(readPrinterBinding(storeB,data)).toBe('principal');
  });
  it('keeps an explicit selection independently for each store',()=>{
    const data=storage(); savePrinterBinding(storeA,printer,data); savePrinterBinding(storeB,'principal',data);
    expect(readPrinterBinding(storeA,data)).toBe(printer); expect(readPrinterBinding(storeB,data)).toBe('principal');
  });
  it('rejects malformed destination bindings from a shortcut',()=>{
    const data=storage();capturePrinterBinding('https://store.example.test/?pos_store='+storeB+'&pos_printer=../../other',data);
    expect(readPrinterBinding(storeB,data)).toBe('principal');
  });
  it('allows queueing offline but never falls back for a revoked or missing destination',()=>{
    expect(availablePrinter(printer,[{id:printer,enabled:true}])).toBe(true);
    expect(availablePrinter(printer,[{id:'principal',enabled:true}])).toBe(false);
    expect(availablePrinter(printer,[{id:printer,enabled:false},{id:'principal',enabled:true}])).toBe(false);
  });
  it('preserves an explicit destination for the session if browser storage is unavailable',()=>{
    const broken={setItem:()=>{throw new Error('blocked');},getItem:()=>{throw new Error('blocked');}};
    savePrinterBinding(storeB,printer,broken);
    expect(readPrinterBinding(storeB,broken)).toBe(printer);
  });
});
