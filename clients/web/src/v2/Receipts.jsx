import React, { useState, useEffect } from 'react';
import { billingService, organizationService } from '../services/api';
import { FileText, Download, Activity, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Receipts() {
 const [invoices, setInvoices] = useState([]);
 const [loading, setLoading] = useState(true);
 const [orgs, setOrgs] = useState([]);
 const [selectedOrg, setSelectedOrg] = useState(null);

 useEffect(() => {
 loadInitial();
 }, []);

 useEffect(() => {
 if (selectedOrg) {
 fetchInvoices(selectedOrg.id);
 }
 }, [selectedOrg]);

 const loadInitial = async () => {
 setLoading(true);
 try {
 const orgData = await organizationService.list();
 setOrgs(orgData || []);
 if (orgData?.length > 0) setSelectedOrg(orgData[0]);
 } catch (err) {
 console.warn('Receipts org load:', err.message);
 } finally {
 setLoading(false);
 }
 };

 const fetchInvoices = async (orgId) => {
 setLoading(true);
 try {
 const data = await billingService.listInvoices(orgId);
 setInvoices(data || []);
 } catch (error) {
 console.warn('Invoices load:', error.message);
 } finally {
 setLoading(false);
 }
 };

 return (
 <div className="v2-app p-8">
 <header className="v2-header flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
 <div>
 <h1 className="text-4xl font-bold">Billing History</h1>
 <p className="text-v2-muted">Last 50 transactions and receipts</p>
 </div>

 {orgs.length > 0 && (
 <select
 className="v2-input px-4 appearance-none bg-white cursor-pointer w-full md:w-64"
 value={selectedOrg?.id || ''}
 onChange={(e) => setSelectedOrg(orgs.find(o => o.id === e.target.value))}
 >
 {orgs.map(o => (
 <option key={o.id} value={o.id}>{o.name}</option>
 ))}
 </select>
 )}
 </header>

 <div className="max-w-4xl mx-auto">
 {loading ? (
 <div className="flex justify-center p-20">
 <Activity className="animate-spin text-v2-accent" size={32} />
 </div>
 ) : invoices.length === 0 ? (
 <div className="v2-card text-center py-20">
 <FileText className="mx-auto text-v2-border mb-4" size={48} />
 <p className="text-v2-muted">No transactions found for this organization.</p>
 </div>
 ) : (
 <div className="space-y-4">
 {invoices.map(tx => (
 <div key={tx.id} className="v2-card flex justify-between items-center hover:border-v2-accent transition-colors cursor-default group">
 <div className="flex items-center gap-4">
 <div className="w-12 h-12 rounded-md bg-[#f0fff4] flex items-center justify-center text-v2-accent">
 <FileText size={20} />
 </div>
 <div>
 <p className="text-lg font-bold capitalize">{tx.status} • {tx.amount} {tx.currency?.toUpperCase()}</p>
 <p className="text-v2-muted text-xs ">Ref: {tx.number || tx.id}</p>
 </div>
 </div>
 <div className="text-right flex flex-col items-end gap-2">
 <p className="text-v2-muted text-sm">{new Date(tx.created_at || tx.date).toLocaleDateString()}</p>
 {tx.invoice_pdf && (
 <a 
 href={tx.invoice_pdf} target="_blank" rel="noreferrer"
 className="text-v2-accent text-xs font-bold hover:underline flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
 >
 <Download size={12} /> Download PDF
 </a>
 )}
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 );
}
