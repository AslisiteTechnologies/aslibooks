import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, Paper, Stack, TextField, Typography } from '@mui/material';
import { api, type Contact, type ContactInput, type ContactLedger, type Organization } from './api';

export function ContactsScreen({ organization }: { organization: Organization }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState({ displayName: '', email: '', phone: '', customer: false, vendor: false });
  const [details, setDetails] = useState({ gstin: '', address: '' });
  const [editing, setEditing] = useState<Contact | null>(null);
  const [archiving, setArchiving] = useState<Contact | null>(null);
  const [statement, setStatement] = useState<ContactLedger | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementLoadingMore, setStatementLoadingMore] = useState(false);
  const [statementRole, setStatementRole] = useState<'customer' | 'vendor'>('customer');
  const [saving, setSaving] = useState(false);
  const [editDraft, setEditDraft] = useState<ContactInput>({ displayName: '', roles: [] });
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const currentQuery = useRef(query);
  const currentOrganization = useRef(organization.id);
  currentQuery.current = query;
  currentOrganization.current = organization.id;
  const canWrite = ['owner', 'admin', 'accountant'].includes(organization.role);
  useEffect(() => {
    let active = true;
    api.contacts(organization.id, query).then(result => { if (active) { setContacts(result.contacts); setNext(result.next); setError(''); } })
      .catch(() => { if (active) setError('Unable to load contacts.'); });
    return () => { active = false; };
  }, [organization.id, query, revision]);
  async function loadMore() {
    if (!next || loadingMore) return;
    const requestedQuery = query;
    const requestedOrganization = organization.id;
    setLoadingMore(true);
    try { const result = await api.contacts(organization.id, query, next); if (currentQuery.current !== requestedQuery || currentOrganization.current !== requestedOrganization) return; setContacts(rows => [...rows, ...result.contacts]); setNext(result.next); setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load more contacts.'); }
    finally { setLoadingMore(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const input: ContactInput = {
      displayName: draft.displayName, email: draft.email,
      phone: draft.phone, gstin: details.gstin, address: details.address,
      roles: [...(draft.customer ? ['customer' as const] : []), ...(draft.vendor ? ['vendor' as const] : [])],
    };
    try {
      await api.createContact(organization.id, input);
      setDraft({ displayName: '', email: '', phone: '', customer: false, vendor: false });
      setDetails({ gstin: '', address: '' });
      setRevision(n => n + 1);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to create contact.'); }
  }
  function beginEdit(contact: Contact) {
    setEditing(contact);
    setEditDraft({ displayName: contact.displayName, email: contact.email ?? '', phone: contact.phone ?? '', gstin: contact.gstin ?? '', address: contact.address ?? '', roles: [...contact.roles] });
  }
  async function saveEdit() {
    if (!editing) return;
    try { setSaving(true); await api.updateContact(organization.id, editing._id, editDraft); setEditing(null); setRevision(n => n + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update contact.'); }
    finally { setSaving(false); }
  }
  async function archiveContact() {
    if (!archiving) return;
    try { setSaving(true); await api.updateContact(organization.id, archiving._id, { active: false }); setArchiving(null); setRevision(n => n + 1); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to archive contact.'); }
    finally { setSaving(false); }
  }
  async function openStatement(contact: Contact, role: 'customer' | 'vendor') {
    const requestedOrganization = organization.id;
    setStatementOpen(true); setStatementLoading(true); setStatement(null); setStatementRole(role); setError('');
    try {
      const result = await api.contactLedger(requestedOrganization, contact._id, role);
      if (currentOrganization.current === requestedOrganization) setStatement(result);
    }
    catch (cause) { if (currentOrganization.current === requestedOrganization) setError(cause instanceof Error ? cause.message : 'Unable to load contact statement.'); }
    finally { setStatementLoading(false); }
  }
  async function loadMoreStatement() {
    if (!statement?.next || statementLoadingMore) return;
    const requestedOrganization = organization.id;
    setStatementLoadingMore(true);
    try {
      const page = await api.contactLedger(requestedOrganization, statement.contact.id, statementRole, statement.next);
      if (currentOrganization.current !== requestedOrganization) return;
      setStatement(current => current?.contact.id === page.contact.id ? { ...current, rows: [...current.rows, ...page.rows], next: page.next } : current);
    } catch (cause) { if (currentOrganization.current === requestedOrganization) setError(cause instanceof Error ? cause.message : 'Unable to load more statement entries.'); }
    finally { setStatementLoadingMore(false); }
  }
  const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);
  return <Stack spacing={2}>
    <Typography variant="h5">Customers and vendors</Typography>
    <TextField label="Search contacts" value={query} onChange={event => setQuery(event.target.value)} />
    {canWrite && <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack component="form" spacing={2} onSubmit={event => { void save(event); }}>
        <Typography variant="h6">Add contact</Typography>
        <TextField required label="Name" value={draft.displayName}
          onChange={event => setDraft({ ...draft, displayName: event.target.value })} />
        <TextField label="Email" type="email" value={draft.email}
          onChange={event => setDraft({ ...draft, email: event.target.value })} />
        <TextField label="Phone" value={draft.phone} onChange={event => setDraft({ ...draft, phone: event.target.value })} />
        <TextField label="GSTIN (optional)" value={details.gstin} inputProps={{ maxLength: 15 }} onChange={event => setDetails({ ...details, gstin: event.target.value.toUpperCase() })} />
        <TextField label="Billing address" multiline minRows={2} value={details.address} onChange={event => setDetails({ ...details, address: event.target.value })} />
        <Stack direction="row">
          <FormControlLabel control={<Checkbox checked={draft.customer} onChange={e => setDraft({ ...draft, customer: e.target.checked })} />} label="Customer" />
          <FormControlLabel control={<Checkbox checked={draft.vendor} onChange={e => setDraft({ ...draft, vendor: e.target.checked })} />} label="Vendor" />
        </Stack>
        <Button type="submit" variant="contained">Save contact</Button>
      </Stack>
    </Paper>}
    {error && <Alert severity="error">{error}</Alert>}
    {!error && !contacts.length && <Typography>No matching contacts.</Typography>}
    {contacts.map(contact => <Paper variant="outlined" sx={{ p: 2 }} key={contact._id}>
      <Typography variant="h6">{contact.displayName}</Typography>
      <Typography>{contact.roles.join(' · ')}{contact.email ? ' · ' + contact.email : ''}</Typography>
      {contact.phone && <Typography variant="body2">Phone: {contact.phone}</Typography>}
      {contact.gstin && <Typography variant="body2">GSTIN: {contact.gstin}</Typography>}
      {contact.address && <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>Billing address: {contact.address}</Typography>}
      <Stack direction="row" spacing={1} flexWrap="wrap">
        {contact.roles.includes('customer') && <Button onClick={() => void openStatement(contact, 'customer')}>Customer statement</Button>}
        {contact.roles.includes('vendor') && <Button onClick={() => void openStatement(contact, 'vendor')}>Vendor statement</Button>}
      </Stack>
      {canWrite && <Stack direction="row" spacing={1}>
        <Button onClick={() => beginEdit(contact)}>Edit details</Button>
        <Button color="error" onClick={() => setArchiving(contact)}>Archive contact</Button>
      </Stack>}
    </Paper>)}
    {next && <Button variant="outlined" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Loading contacts…' : 'Load more contacts'}</Button>}
    <Dialog open={!!editing} onClose={() => { if (!saving) setEditing(null); }} fullWidth maxWidth="sm">
      <DialogTitle>Edit contact details</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <TextField required label="Name" value={editDraft.displayName} onChange={event => setEditDraft({ ...editDraft, displayName: event.target.value })} />
        <TextField label="Email" type="email" value={editDraft.email ?? ''} onChange={event => setEditDraft({ ...editDraft, email: event.target.value })} />
        <TextField label="Phone" value={editDraft.phone ?? ''} onChange={event => setEditDraft({ ...editDraft, phone: event.target.value })} />
        <TextField label="GSTIN (optional)" inputProps={{ maxLength: 15 }} value={editDraft.gstin ?? ''} onChange={event => setEditDraft({ ...editDraft, gstin: event.target.value.toUpperCase() })} />
        <TextField label="Billing address" multiline minRows={2} value={editDraft.address ?? ''} onChange={event => setEditDraft({ ...editDraft, address: event.target.value })} />
        <Stack direction="row"><FormControlLabel label="Customer" control={<Checkbox checked={editDraft.roles.includes('customer')} onChange={event => setEditDraft({ ...editDraft, roles: event.target.checked ? [...new Set([...editDraft.roles, 'customer' as const])] : editDraft.roles.filter(role => role !== 'customer') })} />} />
          <FormControlLabel label="Vendor" control={<Checkbox checked={editDraft.roles.includes('vendor')} onChange={event => setEditDraft({ ...editDraft, roles: event.target.checked ? [...new Set([...editDraft.roles, 'vendor' as const])] : editDraft.roles.filter(role => role !== 'vendor') })} />} /></Stack>
      </Stack></DialogContent>
      <DialogActions><Button disabled={saving} onClick={() => setEditing(null)}>Cancel</Button><Button variant="contained" onClick={() => void saveEdit()} disabled={saving || !editDraft.displayName.trim() || !editDraft.roles.length}>Save changes</Button></DialogActions>
    </Dialog>
    <Dialog open={!!archiving} onClose={() => { if (!saving) setArchiving(null); }}>
      <DialogTitle>Archive contact?</DialogTitle>
      <DialogContent><DialogContentText>{archiving?.displayName} will be unavailable for new transactions. Existing invoices, bills, payments and audit history remain available.</DialogContentText></DialogContent>
      <DialogActions><Button disabled={saving} onClick={() => setArchiving(null)}>Cancel</Button><Button color="error" disabled={saving} onClick={() => void archiveContact()}>Confirm archive</Button></DialogActions>
    </Dialog>
    <Dialog open={statementOpen} onClose={() => setStatementOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>{statement?.contact.displayName ?? 'Contact'} statement</DialogTitle>
      <DialogContent>
        {statementLoading && <Typography role="status">Loading statement…</Typography>}
        {!statementLoading && statement && <Stack spacing={1}>
          <Typography variant="subtitle1">Outstanding balance: {money(statement.balancePaise)}</Typography>
          {statement.rows.length === 0 && <Typography>No posted transactions.</Typography>}
          {statement.rows.map(row => <Paper variant="outlined" sx={{ p: 1.5 }} key={row.eventId}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1}>
              <Stack><Typography fontWeight={600}>{row.description}</Typography><Typography variant="body2">{new Date(row.date).toLocaleDateString('en-IN')} · {row.reference}</Typography></Stack>
              <Stack alignItems={{ xs: 'flex-start', sm: 'flex-end' }}><Typography>Debit {money(row.debitPaise)} · Credit {money(row.creditPaise)}</Typography><Typography variant="body2">Balance {money(row.balancePaise)}</Typography></Stack>
            </Stack>
          </Paper>)}
          {statement.next && <Button variant="outlined" disabled={statementLoadingMore} onClick={() => void loadMoreStatement()}>{statementLoadingMore ? 'Loading entries…' : 'Load more statement entries'}</Button>}
        </Stack>}
        {!statementLoading && error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions><Button onClick={() => setStatementOpen(false)}>Close</Button></DialogActions>
    </Dialog>
  </Stack>;
}

