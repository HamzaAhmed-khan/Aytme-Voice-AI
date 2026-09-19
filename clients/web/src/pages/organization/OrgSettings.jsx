import React, { useState } from 'react';
import { organizationService } from '../../services/api';
import { Settings, Building2, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OrgSettings({ org, onUpdated, onDeleted }) {
    const [name, setName] = useState(org?.name || '');
    const [slug, setSlug] = useState(org?.slug || '');
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!name.trim() || !slug.trim()) { toast.error('Name and slug are required'); return; }
        setSaving(true);
        try {
            const updated = await organizationService.update(org.id, { name, slug });
            toast.success('Organization updated!');
            onUpdated?.(updated);
        } catch (err) {
            toast.error(err.response?.data?.detail || 'Failed to update organization');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        const confirmed = window.prompt(
            `This will permanently delete "${org.name}" and all its data.\n\nType the organization name to confirm:`
        );
        if (confirmed !== org.name) { toast.error('Name did not match. Deletion cancelled.'); return; }
        setDeleting(true);
        try {
            await organizationService.delete(org.id);
            toast.success('Organization deleted');
            onDeleted?.();
        } catch {
            toast.error('Failed to delete organization');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-8 max-w-2xl text-white">
            <div>
                <h3 className="text-2xl font-black tracking-tight">Organization Settings</h3>
                <p className="text-slate-500 text-sm mt-1">Update your workspace details</p>
            </div>

            <form onSubmit={handleSave} className="space-y-5 bg-white/[0.02] border border-white/5 rounded-[40px] p-8">
                <div className="flex items-center gap-3 mb-6">
                    <Settings size={20} className="text-indigo-400" />
                    <h4 className="font-black uppercase tracking-widest text-sm">General</h4>
                </div>
                <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Organization Name</label>
                    <input
                        value={name} onChange={e => setName(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm"
                    />
                </div>
                <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Slug (URL identifier)</label>
                    <input
                        value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                        className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500/50 text-sm font-mono"
                    />
                </div>
                <button type="submit" disabled={saving}
                    className="flex items-center gap-2 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all disabled:opacity-60"
                >
                    {saving ? <RefreshCw size={14} className="animate-spin" /> : null}
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </form>

            {/* Danger Zone */}
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-[40px] p-8">
                <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle size={20} className="text-rose-400" />
                    <h4 className="font-black uppercase tracking-widest text-sm text-rose-400">Danger Zone</h4>
                </div>
                <p className="text-slate-400 text-sm mb-6">
                    Deleting <strong>{org?.name}</strong> will permanently remove all members, rooms, transcripts, and billing data. This action cannot be undone.
                </p>
                <button
                    onClick={handleDelete} disabled={deleting}
                    className="flex items-center gap-2 px-6 py-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-2xl font-black uppercase tracking-widest text-xs transition-all disabled:opacity-60"
                >
                    {deleting ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    Delete Organization
                </button>
            </div>
        </div>
    );
}
