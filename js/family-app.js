import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js';
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

Alpine.data('familyApp', () => ({
    appState: 'loading',
    userUid: null,
    userName: '',
    userContact: '',
    activeOrgId: null,
    activeOrg: {},
    
    // Navigasi & Modal
    activeTab: 'chat',
    showMenu: false,
    showMergeModal: false,
    showProfileModal: false,
    showFinanceModal: false,
    showPermissionsModal: false,
    showMemberModal: false,
    showNotebookModal: false,

    // Data Real-time
    messages: [],
    newMessage: '',
    members: [],
    memberSort: 'role',
    
    // Keuangan
    financeSubTab: 'cashflow',
    financeFilter: 'monthly',
    transactions: [],
    budgets: [],
    debts: [],
    newTx: { type: 'expense', amount: '', desc: '' },
    newItem: { name: '', amount: '', dueDate: '' },

    // Catatan (Notebook)
    notes: [],
    notebookMode: 'list',
    noteForm: { id: null, title: '', content: '' },

    // Perizinan & Profil
    permissions: { view_finance: true, edit_finance: false, manage_budget: false, manage_members: false, edit_permissions: false, view_notebook: true, edit_notebook: false },
    profileForm: { name: '', role: '', email: '' },
    memberModalMode: 'add',
    selectedMember: null,
    memberForm: { role: '' },
    selectedMemberForPerms: '',
    editingPerms: {},
    mergeTargetId: '',

    init() {
        // Ambil orgId dari URL parameter (?orgId=ORG-XXXX)
        const params = new URLSearchParams(window.location.search);
        this.activeOrgId = params.get('orgId');

        if (!this.activeOrgId) {
            alert("Organisasi tidak ditemukan!");
            window.location.href = 'index.html';
            return;
        }

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.userUid = user.uid;
                this.userContact = user.phoneNumber || user.email || "";
                await this.loadAppData();
            } else {
                window.location.href = 'index.html'; // Kalau belum login, lempar ke gerbang
            }
        });
    },

    async loadAppData() {
        try {
            // 1. Ambil Profil User
            const userSnap = await getDoc(doc(db, "users", this.userUid));
            if (userSnap.exists()) {
                const uData = userSnap.data();
                this.userName = uData.name || "User";
                this.profileForm.name = uData.name || "";
                this.profileForm.email = uData.email || this.userContact;
            }

            // 2. Ambil Data Organisasi
            const orgSnap = await getDoc(doc(db, "organizations", this.activeOrgId));
            if (!orgSnap.exists()) {
                alert("Organisasi sudah tidak ada atau telah dibubarkan.");
                window.location.href = 'index.html';
                return;
            }
            // Tangkap ID dokumen agar terbaca di HTML
            const orgData = orgSnap.data();
            this.activeOrg = { 
                id: orgData.org_id || orgSnap.id, 
                ...orgData 
            };

            // 3. Ambil Peran & Hak Akses User di Organisasi ini
            const memberSnap = await getDoc(doc(db, "organizations", this.activeOrgId, "members", this.userUid));
            if (memberSnap.exists()) {
                const mData = memberSnap.data();
                this.profileForm.role = mData.role_name || "Member";
                if (mData.permissions) {
                    this.permissions = { ...this.permissions, ...mData.permissions };
                }
            } else {
                // Jika user memaksa masuk via URL tapi belum terdaftar di member
                alert("Anda tidak memiliki akses ke keluarga ini.");
                window.location.href = 'index.html';
                return;
            }

            // 4. Pasang Real-time Listeners
            this.listenToMessages();
            this.listenToMembers();
            this.listenToFinance();
            this.listenToNotebook();

            // Cek apakah ada riwayat tab terakhir yang disimpan
            const savedTab = localStorage.getItem('synora_active_tab_' + this.activeOrgId);
            if (savedTab) {
                this.activeTab = savedTab;
            }

            this.appState = 'main';
        } catch (e) {
            console.error(e);
            alert("Gagal memuat data: " + e.message);
        }
    },

    switchTab(tab) {
        this.activeTab = tab;
        this.showMenu = false;
        // Simpan tab terakhir ke localStorage browser
        localStorage.setItem('synora_active_tab_' + this.activeOrgId, tab);
    },

    // --- CHAT SYSTEM ---
    listenToMessages() {
        const q = query(collection(db, "organizations", this.activeOrgId, "messages"), orderBy("timestamp", "asc"));
        onSnapshot(q, (snapshot) => {
            this.messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            this.scrollToBottom();
        });
    },
    async sendMessage() {
        if (!this.newMessage.trim()) return;
        const text = this.newMessage.trim();
        this.newMessage = '';
        await addDoc(collection(db, "organizations", this.activeOrgId, "messages"), {
            sender_id: this.userUid,
            text: text,
            timestamp: serverTimestamp()
        });
        this.scrollToBottom();
    },
    scrollToBottom() {
        setTimeout(() => {
            const container = document.getElementById('chat-container');
            if (container) container.scrollTop = container.scrollHeight;
        }, 100);
    },
    getMemberName(uid) {
        const m = this.members.find(x => x.uid === uid);
        return m ? (m.name || m.role_name || "Anggota") : "Anggota";
    },

    // --- FINANCE SYSTEM ---
    listenToFinance() {
        // Cashflow
        onSnapshot(query(collection(db, "organizations", this.activeOrgId, "transactions"), orderBy("timestamp", "desc")), (snap) => {
            this.transactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        // Budgets
        onSnapshot(collection(db, "organizations", this.activeOrgId, "budgets"), (snap) => {
            this.budgets = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        // Debts
        onSnapshot(collection(db, "organizations", this.activeOrgId, "debts"), (snap) => {
            this.debts = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
    },

    get filteredTransactions() {
        // Filter sederhana berdasarkan waktu
        return this.transactions;
    },
    get totalCash() {
        return this.transactions.reduce((acc, tx) => tx.type === 'income' ? acc + Number(tx.amount) : acc - Number(tx.amount), 0);
    },
    get currentIncome() {
        return this.transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + Number(t.amount), 0);
    },
    get currentExpense() {
        return this.transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + Number(t.amount), 0);
    },

    async saveFinanceData() {
        if (this.financeSubTab === 'cashflow') {
            if (!this.newTx.amount || !this.newTx.desc) return alert("Lengkapi data transaksi!");
            await addDoc(collection(db, "organizations", this.activeOrgId, "transactions"), {
                type: this.newTx.type,
                amount: Number(this.newTx.amount),
                desc: this.newTx.desc,
                timestamp: serverTimestamp()
            });
            this.newTx = { type: 'expense', amount: '', desc: '' };
        } else if (this.financeSubTab === 'budget') {
            if (!this.newItem.name || !this.newItem.amount) return alert("Lengkapi data anggaran!");
            await addDoc(collection(db, "organizations", this.activeOrgId, "budgets"), {
                name: this.newItem.name,
                amount: Number(this.newItem.amount),
                dueDate: this.newItem.dueDate || ''
            });
            this.newItem = { name: '', amount: '', dueDate: '' };
        } else if (this.financeSubTab === 'debt') {
            if (!this.newItem.name || !this.newItem.amount) return alert("Lengkapi data hutang!");
            await addDoc(collection(db, "organizations", this.activeOrgId, "debts"), {
                name: this.newItem.name,
                amount: Number(this.newItem.amount),
                dueDate: this.newItem.dueDate || ''
            });
            this.newItem = { name: '', amount: '', dueDate: '' };
        }
        this.showFinanceModal = false;
    },

    // --- MEMBERS SYSTEM ---
    listenToMembers() {
        onSnapshot(collection(db, "organizations", this.activeOrgId, "members"), (snap) => {
            this.members = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
    },
    get sortedMembers() {
        return [...this.members].sort((a, b) => {
            if (this.memberSort === 'role') return (a.role_name || '').localeCompare(b.role_name || '');
            if (this.memberSort === 'alphabet') return (a.name || '').localeCompare(b.name || '');
            return 0;
        });
    },
    openMemberModal(mode, member = null) {
        this.memberModalMode = mode;
        if (mode === 'edit' && member) {
            this.selectedMember = member;
            this.memberForm.role = member.role_name || '';
        }
        this.showMemberModal = true;
    },
    async saveMember() {
        if (!this.selectedMember) return;
        await updateDoc(doc(db, "organizations", this.activeOrgId, "members", this.selectedMember.uid), {
            role_name: this.memberForm.role
        });
        this.showMemberModal = false;
    },
    async removeMember() {
        if (!confirm("Keluarkan anggota ini dari keluarga?")) return;
        const batch = writeBatch(db);
        batch.delete(doc(db, "organizations", this.activeOrgId, "members", this.selectedMember.uid));
        // Hapus juga ID org dari profil user target jika perlu
        await batch.commit();
        this.showMemberModal = false;
    },

    // --- NOTEBOOK SYSTEM ---
    listenToNotebook() {
        onSnapshot(collection(db, "organizations", this.activeOrgId, "notebook"), (snap) => {
            this.notes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
    },
    openNotebook() {
        this.notebookMode = 'list';
        this.showNotebookModal = true;
    },
    async saveNote() {
        if (!this.noteForm.title.trim()) return alert("Judul catatan wajib diisi!");
        if (this.noteForm.id) {
            await updateDoc(doc(db, "organizations", this.activeOrgId, "notebook", this.noteForm.id), {
                title: this.noteForm.title,
                content: this.noteForm.content,
                updated_at: serverTimestamp()
            });
        } else {
            await addDoc(collection(db, "organizations", this.activeOrgId, "notebook"), {
                title: this.noteForm.title,
                content: this.noteForm.content,
                updated_at: serverTimestamp()
            });
        }
        this.notebookMode = 'list';
    },
    async deleteNote(id) {
        if (!confirm("Hapus catatan ini?")) return;
        await deleteDoc(doc(db, "organizations", this.activeOrgId, "notebook", id));
        this.notebookMode = 'list';
    },

    // --- PROFILE & PERMISSIONS ---
    openProfileModal() { 
        this.profileForm.phone = this.userContact; // Muat kontak saat ini
        this.showProfileModal = true; 
    },
    async saveProfile() {
        try {
            // 1. Update data di koleksi users database
            await updateDoc(doc(db, "users", this.userUid), { 
                name: this.profileForm.name,
                contact: this.profileForm.phone 
            });

            // 2. Update data di sub-koleksi members organisasi
            await updateDoc(doc(db, "organizations", this.activeOrgId, "members", this.userUid), { 
                name: this.profileForm.name,
                role_name: this.profileForm.role 
            });

            // 3. Jika user mengisi password baru dan menggunakan email auth
            if (this.profileForm.newPassword && auth.currentUser && auth.currentUser.email) {
                const { updatePassword } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js");
                await updatePassword(auth.currentUser, this.profileForm.newPassword);
            }

            this.userName = this.profileForm.name;
            this.userContact = this.profileForm.phone;
            this.showProfileModal = false;
            this.profileForm.newPassword = ''; // Reset form password
            alert("Profil dan pengaturan berhasil disimpan!");
        } catch (e) {
            alert("Gagal menyimpan profil: " + e.message);
        }
    },
    openPermissionsModal() {
        this.showPermissionsModal = true;
    },
    loadMemberPerms() {
        const m = this.members.find(x => x.uid === this.selectedMemberForPerms);
        if (m && m.permissions) {
            this.editingPerms = { ...m.permissions };
        } else {
            this.editingPerms = { view_finance: true, edit_finance: false, manage_budget: false, manage_members: false, edit_permissions: false, view_notebook: true, edit_notebook: false };
        }
    },
    async saveMemberPerms() {
        if (!this.selectedMemberForPerms) return;
        await updateDoc(doc(db, "organizations", this.activeOrgId, "members", this.selectedMemberForPerms), {
            permissions: this.editingPerms
        });
        this.showPermissionsModal = false;
        alert("Hak akses berhasil diperbarui!");
    },

    // --- MERGE FAMILY ---
    async mergeFamily() {
        if (!this.mergeTargetId.trim()) return alert("Masukkan ID target!");
        // Logika serap keluarga
        alert("Fitur merge siap dikembangkan.");
        this.showMergeModal = false;
    },

    // --- UTILITIES ---
    formatCurrency(val) {
        return new Number(val || 0).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
    },
    formatTime(ts) {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },
    formatDate(ts) {
        if (!ts) return '';
        const d = ts.toDate ? ts.toDate() : new Date(ts);
        return d.toLocaleDateString();
    },
    getTimerText(dateStr) {
        if (!dateStr) return 'Tanpa batas';
        const diff = new Date(dateStr) - new Date();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return days > 0 ? `${days} hari lagi` : 'Sudah lewat';
    },
    getTimerColor(dateStr) {
        return 'text-blue-600';
    },
    copyOrgId() {
        navigator.clipboard.writeText(this.activeOrgId);
        alert("ID Organisasi disalin: " + this.activeOrgId);
    },
    requestNotificationPermission() {
        alert("Notifikasi diaktifkan!");
    }
}));

window.Alpine = Alpine;
Alpine.start();
