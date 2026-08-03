import Alpine from 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/module.esm.js';

import { auth, db } from './firebase-config.js';
import { RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateEmail, updatePassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, writeBatch, onSnapshot, collection, addDoc, query, where, getDocs, deleteDoc, arrayUnion, arrayRemove, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

Alpine.data('synoraApp', () => ({
    
    appState: 'loading', // 'loading', 'login', 'select_org', 'main'
    userUid: null,
    userShortId: '',
    userName: '', 
    phoneNumber: '',
    otpSent: false,
    otpCode: '',
    authMode: 'phone', 
    email: '',
    password: '',
    confirmationResult: null,

    // ORG SELECTION STATE
    myOrganizations: [], 
    newFamilyName: '',
    joinOrgId: '',
    showJoinInput: false,

    activeTab: localStorage.getItem('last_active_tab') || 'chat',
    activeOrg: { id: null, name: '' },
    permissions: {},
    showMenu: false,
    members: [], 
    
    messages: [],
    newMessage: '',
    transactions: [],
    totalCash: 0,
    showTxModal: false, 
    newTx: { type: 'expense', amount: '', desc: '' }, 
    financeFilter: 'monthly', 
    financeSubTab: 'cashflow', 
    budgets: [],
    debts: [],
    showFinanceModal: false,
    newItem: { name: '', amount: '', dueDate: '' },

    memberSort: 'role', 
    showMemberModal: false,
    memberModalMode: 'add', 
    memberForm: { uid: '', shortId: '', role: '' },

    showProfileModal: false,
    profileForm: { name: '', role: '', phone: '', email: '', newPassword: '' },
    
    showPermissionsModal: false,
    selectedMemberForPerms: '',
    editingPerms: {},

    showNotebookModal: false,
    notebookMode: 'list', 
    notes: [],
    noteForm: { id: null, title: '', content: '' },

    // MERGE STATE
    showMergeModal: false,
    mergeTargetId: '',

    // MEMORY MANAGEMENT (Menghindari kebocoran data antar Org)
    unsubChat: null,
    unsubFinance: null,
    unsubMembers: null,
    unsubBudgets: null,
    unsubDebts: null,
    unsubPerms: null,
    unsubNotebook: null,

    init() {
        console.log('SYNORA App Initialized');
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                this.userUid = user.uid;
                await this.checkUserStatus(user.uid, user.phoneNumber || user.email || "No Contact");
            } else {
                this.appState = 'login';
                setTimeout(() => { this.setupRecaptcha(); }, 300);
            }
        });
    },

    setupRecaptcha() {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
            'size': 'normal', 'callback': (response) => {}
        });
    },

    async sendOTP() {
        if (!this.phoneNumber) return alert("Masukkan nomor HP!");
        try {
            const appVerifier = window.recaptchaVerifier;
            this.confirmationResult = await signInWithPhoneNumber(auth, this.phoneNumber, appVerifier);
            this.otpSent = true;
        } catch (error) { alert("GAGAL: " + error.message); }
    },

    async verifyOTP() {
        if (!this.otpCode) return;
        try {
            const result = await this.confirmationResult.confirm(this.otpCode);
            this.userUid = result.user.uid;
            await this.checkUserStatus(result.user.uid, result.user.phoneNumber);
        } catch (error) { alert("OTP Salah!"); }
    },
    
    async loginWithEmail() {
        if(!this.email || !this.password) return alert("Isi email dan password!");
        try {
            this.appState = 'loading'; 
            await signInWithEmailAndPassword(auth, this.email, this.password);
        } catch (error) {
            this.appState = 'login';
            alert("Login Gagal: Pastikan email dan password benar.");
        }
    },

    async registerWithEmail() {
        if(!this.email || !this.password) return alert("Isi email dan password!");
        if(this.password.length < 6) return alert("Password minimal 6 karakter!");
        try {
            this.appState = 'loading';
            await createUserWithEmailAndPassword(auth, this.email, this.password);
        } catch(error) {
            this.appState = 'login';
            alert("Daftar Gagal: " + error.message);
        }
    },

    // --- CHECK STATUS & LOAD ORGANIZATIONS ---
    async checkUserStatus(uid, contact) {
        const userRef = doc(db, "users", uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const userData = userSnap.data();
            this.userShortId = userData.short_id;
            this.userName = userData.name || ""; 
            
            if (userData.joined_organizations && userData.joined_organizations.length > 0) {
                // Load My Organizations List First
                await this.loadMyOrganizationsList(userData.joined_organizations);
                
                // Auto-login to the last used organization (if exists in list) or pick the first one
                const savedOrg = localStorage.getItem('last_active_org');
                const targetOrgId = userData.joined_organizations.includes(savedOrg) ? savedOrg : userData.joined_organizations[0];
                
                await this.selectOrg(targetOrgId);
            } else {
                this.appState = 'select_org'; 
            }
        } else {
            const shortId = "USR-" + Math.random().toString(36).substring(2, 8).toUpperCase();
            await setDoc(userRef, {
                uid: uid, short_id: shortId, contact: contact, name: "New User",
                joined_organizations: [], created_at: new Date()
            });
            this.userName = "New User";
            this.appState = 'select_org';
        }
    },

    async loadMyOrganizationsList(orgIds) {
        this.myOrganizations = [];
        for(let orgId of orgIds) {
            const snap = await getDoc(doc(db, "organizations", orgId));
            if(snap.exists()) {
                this.myOrganizations.push({ id: orgId, name: snap.data().name });
            }
        }
    },

    // --- SWITCH ORGANIZATION LOGIC ---
    openOrgSelector() {
        this.appState = 'select_org';
    },

    unsubscribeAllListeners() {
        if(this.unsubChat) { this.unsubChat(); this.unsubChat = null; }
        if(this.unsubFinance) { this.unsubFinance(); this.unsubFinance = null; }
        if(this.unsubMembers) { this.unsubMembers(); this.unsubMembers = null; }
        if(this.unsubBudgets) { this.unsubBudgets(); this.unsubBudgets = null; }
        if(this.unsubDebts) { this.unsubDebts(); this.unsubDebts = null; }
        if(this.unsubPerms) { this.unsubPerms(); this.unsubPerms = null; }
        if(this.unsubNotebook) { this.unsubNotebook(); this.unsubNotebook = null; }
        
        // Bersihkan state UI untuk Org baru
        this.messages = [];
        this.transactions = [];
        this.members = [];
        this.budgets = [];
        this.debts = [];
    },

    async selectOrg(orgId, orgName = null) {
        this.appState = 'loading';
        this.unsubscribeAllListeners();

        if(!orgName) {
            const snap = await getDoc(doc(db, "organizations", orgId));
            orgName = snap.exists() ? snap.data().name : "Unknown Organization";
        }

        this.activeOrg = { id: orgId, name: orgName };
        localStorage.setItem('last_active_org', orgId);

        this.listenToPermissions(this.userUid, orgId);
        this.listenToChat(orgId);
        this.listenToFinance(orgId);
        this.listenToMembers(orgId);
        this.listenToBudgetsAndDebts(orgId);
        
        this.appState = 'main';
    },

    async createFamily() {
        if (!this.newFamilyName) return alert("Masukkan nama keluarga!");
        const orgId = "ORG-" + Math.random().toString(36).substring(2, 10).toUpperCase();
        const batch = writeBatch(db); 

        batch.set(doc(db, "organizations", orgId), { org_id: orgId, type: "Family", name: this.newFamilyName, head_id: this.userUid, created_at: new Date() });
        batch.set(doc(db, "organizations", orgId, "members", this.userUid), {
            uid: this.userUid, role_name: "Head", name: this.userName || "Head", joined_at: new Date(), 
            permissions: { view_finance: true, edit_finance: true, manage_budget: true, manage_members: true, edit_permissions: true, merge_family: true, view_notebook: true, edit_notebook: true }
        });
        batch.update(doc(db, "users", this.userUid), { joined_organizations: arrayUnion(orgId) });

        try {
            await batch.commit(); 
            this.myOrganizations.push({ id: orgId, name: this.newFamilyName }); // Update Local List
            await this.selectOrg(orgId, this.newFamilyName);
        } catch (error) { alert("Terjadi kesalahan sistem."); }
    },

    async joinOrganization() {
        const orgId = this.joinOrgId.trim().toUpperCase(); 
        if (!orgId || !orgId.startsWith("ORG-")) return alert("Format ID salah. Harus berawalan ORG-");
        if (this.myOrganizations.find(o => o.id === orgId)) return alert("Anda sudah berada di Organisasi ini!");

        try {
            const orgSnap = await getDoc(doc(db, "organizations", orgId));
            if (!orgSnap.exists()) return alert("Organisasi tidak ditemukan!");

            const batch = writeBatch(db); 
            batch.set(doc(db, "organizations", orgId, "members", this.userUid), {
                uid: this.userUid, role_name: "Member", name: this.userName || "Member", joined_at: new Date(),
                permissions: { view_finance: true, edit_finance: false, manage_budget: false, manage_members: false, edit_permissions: false, merge_family: false, view_notebook: true, edit_notebook: false }
            });
            batch.update(doc(db, "users", this.userUid), { joined_organizations: arrayUnion(orgId) });

            await batch.commit(); 
            this.myOrganizations.push({ id: orgId, name: orgSnap.data().name }); // Update Local List
            await this.selectOrg(orgId, orgSnap.data().name);
        } catch (error) { alert("Gagal bergabung."); }
    },

    // --- MERGE FAMILY LOGIC ---
    async mergeFamily() {
        const targetOrgId = this.mergeTargetId.trim().toUpperCase();
        if(!targetOrgId || !targetOrgId.startsWith('ORG-')) return alert("Format ID salah!");
        if(targetOrgId === this.activeOrg.id) return alert("Tidak bisa merge dengan organisasi sendiri!");

        try {
            const snap = await getDoc(doc(db, "organizations", targetOrgId));
            if(!snap.exists()) return alert("Organisasi target tidak ditemukan.");

            const membersSnap = await getDocs(collection(db, "organizations", targetOrgId, "members"));
            if(membersSnap.empty) return alert("Organisasi target kosong.");

            const batch = writeBatch(db);
            let addedCount = 0;

            membersSnap.forEach(memberDoc => {
                const memberData = memberDoc.data();
                const targetUid = memberData.uid;

                if(this.members.find(m => m.uid === targetUid)) return; // Skip if already inside

                batch.set(doc(db, "organizations", this.activeOrg.id, "members", targetUid), {
                    uid: targetUid,
                    short_id: memberData.short_id || "USR",
                    name: memberData.name || "Member",
                    role_name: "Extended Family", // Label otomatis hasil merge
                    joined_at: serverTimestamp(),
                    permissions: { view_finance: true, edit_finance: false, edit_notebook: false, view_notebook: true, edit_permissions: false, manage_members: false }
                });

                batch.update(doc(db, "users", targetUid), {
                    joined_organizations: arrayUnion(this.activeOrg.id)
                });
                addedCount++;
            });

            if (addedCount === 0) return alert("Semua anggota dari keluarga target sudah ada di organisasi ini.");

            await batch.commit();
            alert(`Berhasil Merge! ${addedCount} anggota telah ditambahkan sebagai 'Extended Family'.`);
            this.showMergeModal = false;
            this.mergeTargetId = '';

        } catch (error) {
            alert("Gagal melakukan merge: " + error.message);
        }
    },

    // --- PROFILE & PERMISSIONS ---
    async openProfileModal() {
        const userSnap = await getDoc(doc(db, "users", this.userUid));
        const data = userSnap.data();
        const myOrgData = this.members.find(m => m.uid === this.userUid);

        this.profileForm = {
            name: data.name || '',
            role: myOrgData ? myOrgData.role_name : '', 
            phone: data.phone || data.contact || '', 
            email: auth.currentUser.email || '',
            newPassword: ''
        };
        this.showProfileModal = true;
    },

    async saveProfile() {
        try {
            await updateDoc(doc(db, "users", this.userUid), {
                name: this.profileForm.name,
                phone: this.profileForm.phone,
                contact: this.profileForm.email || this.profileForm.phone
            });
            
            if(this.activeOrg.id) {
                const updateData = { name: this.profileForm.name };
                if (this.profileForm.role) updateData.role_name = this.profileForm.role;
                await updateDoc(doc(db, "organizations", this.activeOrg.id, "members", this.userUid), updateData);
            }

            this.userName = this.profileForm.name; 

            let authWarning = "";
            try {
                if (this.profileForm.email && auth.currentUser && this.profileForm.email !== auth.currentUser.email) {
                    await updateEmail(auth.currentUser, this.profileForm.email);
                }
                if (this.profileForm.newPassword && auth.currentUser) {
                    await updatePassword(auth.currentUser, this.profileForm.newPassword);
                }
            } catch (authError) {
                console.warn("Auth Update Error:", authError);
                authWarning = "\n\nCatatan: Nama dan Role telah tersimpan! Namun, pergantian Login Email/Password ditolak Firebase (Perlu verifikasi email atau login ulang).";
            }

            alert("Proses Selesai!" + authWarning);
            this.showProfileModal = false;
        } catch (error) {
            alert("Database Error: " + error.message);
        }
    },

    openPermissionsModal() {
        this.selectedMemberForPerms = '';
        this.editingPerms = {};
        this.showPermissionsModal = true;
    },

    loadMemberPerms() {
        if(!this.selectedMemberForPerms) {
            this.editingPerms = {};
            return;
        }
        const target = this.members.find(m => m.uid === this.selectedMemberForPerms);
        if(target) this.editingPerms = JSON.parse(JSON.stringify(target.permissions || {}));
    },

    async saveMemberPerms() {
        if(!this.selectedMemberForPerms) return;
        try {
            await updateDoc(doc(db, "organizations", this.activeOrg.id, "members", this.selectedMemberForPerms), {
                permissions: this.editingPerms
            });
            alert("Berhasil! Otoritas anggota telah diubah.");
            this.selectedMemberForPerms = '';
            this.showPermissionsModal = false;
        } catch (e) {
            alert("Gagal menyimpan permissions: " + e.message);
        }
    },

    // --- NOTEBOOK LOGIC ---
    openNotebook() {
        if (!this.permissions.view_notebook) return alert("Anda dilarang mengakses Notebook organisasi.");
        this.showNotebookModal = true;
        this.notebookMode = 'list';
        this.listenToNotebook(this.activeOrg.id);
    },

    listenToNotebook(orgId) {
        if(this.unsubNotebook) this.unsubNotebook();
        const notebookRef = collection(db, 'organizations', orgId, 'notebook');
        const q = query(notebookRef, orderBy('updated_at', 'desc'));
        this.unsubNotebook = onSnapshot(q, (snapshot) => {
            this.notes = [];
            snapshot.forEach((doc) => { this.notes.push({ id: doc.id, ...doc.data() }); });
        });
    },

    async saveNote() {
        if(!this.permissions.edit_notebook) return alert("Anda tidak diizinkan menulis catatan.");
        if(!this.noteForm.title || !this.noteForm.content) return alert("Judul dan isi tidak boleh kosong.");
        const orgId = this.activeOrg.id;
        
        try {
            if (this.noteForm.id) {
                await updateDoc(doc(db, "organizations", orgId, "notebook", this.noteForm.id), {
                    title: this.noteForm.title, content: this.noteForm.content, updated_at: serverTimestamp(), updated_by: this.userUid
                });
            } else {
                await addDoc(collection(db, "organizations", orgId, "notebook"), {
                    title: this.noteForm.title, content: this.noteForm.content, updated_at: serverTimestamp(), updated_by: this.userUid
                });
            }
            this.notebookMode = 'list';
        } catch(e) { alert("Failed to save note."); }
    },

    async deleteNote(noteId) {
        if(!this.permissions.edit_notebook) return alert("Anda tidak diizinkan menghapus catatan.");
        if(!confirm("Hapus catatan ini selamanya?")) return;
        try {
            await deleteDoc(doc(db, "organizations", this.activeOrg.id, "notebook", noteId));
            this.notebookMode = 'list';
        } catch(e) { alert("Gagal menghapus."); }
    },

    // --- CORE LOGIC (Chat, Finance, Member) ---
    listenToChat(orgId) {
        const q = query(collection(db, 'chats', 'CHAT-' + orgId, 'messages'), orderBy('timestamp', 'asc'));
        this.unsubChat = onSnapshot(q, (snapshot) => {
            this.messages = [];
            snapshot.forEach((doc) => { this.messages.push({ id: doc.id, ...doc.data() }); });
            setTimeout(() => {
                const container = document.getElementById('chat-container');
                if(container) container.scrollTop = container.scrollHeight;
            }, 100);
        });
    },
    
    async sendMessage() {
        if (!this.newMessage.trim()) return; 
        const msgText = this.newMessage;
        this.newMessage = ''; 
        try {
            await addDoc(collection(db, 'chats', 'CHAT-' + this.activeOrg.id, 'messages'), {
                sender_id: this.userUid, sender_name: this.userName || "Member", text: msgText, timestamp: serverTimestamp()
            });
        } catch (error) { console.error("Gagal mengirim pesan"); }
    },

    listenToFinance(orgId) {
        const q = query(collection(db, 'organizations', orgId, 'finance_transactions'), orderBy('timestamp', 'desc'));
        this.unsubFinance = onSnapshot(q, (snapshot) => {
            this.transactions = [];
            let calculatedTotal = 0; 
            snapshot.forEach((doc) => {
                const data = doc.data();
                this.transactions.push({ id: doc.id, ...data });
                calculatedTotal += data.type === 'income' ? data.amount : -data.amount;
            });
            this.totalCash = calculatedTotal;
        });
    },

    listenToBudgetsAndDebts(orgId) {
        this.unsubBudgets = onSnapshot(collection(db, "organizations", orgId, "budgets"), (snapshot) => {
            this.budgets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
        this.unsubDebts = onSnapshot(collection(db, "organizations", orgId, "debts"), (snapshot) => {
            this.debts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        });
    },

    get filteredTransactions() {
        if(!this.transactions) return [];
        const now = new Date();
        return this.transactions.filter(tx => {
            const txDate = tx.timestamp?.toDate ? tx.timestamp.toDate() : new Date(); 
            if (this.financeFilter === 'daily') return txDate.toDateString() === now.toDateString();
            else if (this.financeFilter === 'weekly') return txDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            else return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear();
        });
    },

    get currentIncome() { return this.filteredTransactions.filter(t => t.type === 'income').reduce((sum, curr) => sum + curr.amount, 0); },
    get currentExpense() { return this.filteredTransactions.filter(t => t.type === 'expense').reduce((sum, curr) => sum + curr.amount, 0); },
    
    getTimerText(dueDateStr) {
        if (!dueDateStr) return "No Due Date";
        const due = new Date(dueDateStr); const now = new Date();
        due.setHours(0,0,0,0); now.setHours(0,0,0,0);
        const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24)); 
        if (diffDays > 0) return `${diffDays} days left`;
        if (diffDays === 0) return `Due Today`;
        return `Overdue by ${Math.abs(diffDays)} days`;
    },

    getTimerColor(dueDateStr) {
        return (this.getTimerText(dueDateStr).includes("Overdue") || this.getTimerText(dueDateStr).includes("Today")) ? "text-red-600" : "text-gray-700";
    },

    async saveTransaction() {
        if (!this.newTx.amount || !this.newTx.desc) return alert("Fill all fields!");
        try {
            await addDoc(collection(db, 'organizations', this.activeOrg.id, 'finance_transactions'), {
                type: this.newTx.type, amount: Number(this.newTx.amount), desc: this.newTx.desc, created_by: this.userUid, timestamp: serverTimestamp()
            });
            this.newTx = { type: 'expense', amount: '', desc: '' };
            this.showTxModal = false;
        } catch (error) { alert("Failed to save data."); }
    },

    async saveFinanceData() {
        if (this.financeSubTab === 'cashflow') { this.saveTransaction(); this.showFinanceModal = false; }
        else {
            if (!this.newItem.name || !this.newItem.amount || !this.newItem.dueDate) return alert("Fill all fields!");
            const col = this.financeSubTab === 'budget' ? 'budgets' : 'debts';
            await addDoc(collection(db, "organizations", this.activeOrg.id, col), {
                name: this.newItem.name, amount: Number(this.newItem.amount), dueDate: this.newItem.dueDate, created_by: this.userUid, timestamp: serverTimestamp()
            });
            this.newItem = { name: '', amount: '', dueDate: '' };
            this.showFinanceModal = false;
        }
    },

    listenToMembers(orgId) {
        this.unsubMembers = onSnapshot(collection(db, 'organizations', orgId, 'members'), (snapshot) => {
            this.members = [];
            snapshot.forEach((doc) => { this.members.push(doc.data()); });
        });
    },

    get sortedMembers() {
        if(!this.members) return [];
        let sorted = [...this.members];
        if (this.memberSort === 'role') {
            sorted.sort((a, b) => {
                if (a.role_name === 'Head') return -1; if (b.role_name === 'Head') return 1;
                return a.role_name.localeCompare(b.role_name);
            });
        } else if (this.memberSort === 'alphabet') {
            sorted.sort((a, b) => (a.short_id || "M").localeCompare(b.short_id || "M"));
        } else if (this.memberSort === 'date') {
            sorted.sort((a, b) => {
                const dateA = a.joined_at?.toDate ? a.joined_at.toDate() : new Date(0);
                const dateB = b.joined_at?.toDate ? b.joined_at.toDate() : new Date(0);
                return dateB - dateA; 
            });
        }
        return sorted;
    },

    openMemberModal(mode, member = null) {
        this.memberModalMode = mode;
        this.memberForm = mode === 'add' ? { uid: '', shortId: '', role: '' } : { uid: member.uid, shortId: member.short_id || '', role: member.role_name };
        this.showMemberModal = true;
    },

    async saveMember() {
        if (!this.memberForm.role) return alert("Role tidak boleh kosong!");
        const orgId = this.activeOrg.id;
        if (this.memberModalMode === 'add') {
            if (!this.memberForm.shortId) return alert("Masukkan Short ID!");
            const snap = await getDocs(query(collection(db, "users"), where("short_id", "==", this.memberForm.shortId.toUpperCase())));
            if(snap.empty) return alert("User ID tidak ditemukan!");
            
            const targetUser = snap.docs[0].data();
            const targetUid = snap.docs[0].id;
            
            if (this.members.find(m => m.uid === targetUid)) return alert("Anggota ini sudah ada di organisasi!");
            const batch = writeBatch(db);
            batch.set(doc(db, "organizations", orgId, "members", targetUid), {
                uid: targetUid, short_id: targetUser.short_id, name: targetUser.name || "Member", role_name: this.memberForm.role, joined_at: serverTimestamp(),
                permissions: { view_finance: true, edit_finance: false, edit_notebook: false, view_notebook: true, manage_members: false, edit_permissions: false } 
            });
            batch.update(doc(db, "users", targetUid), { joined_organizations: arrayUnion(orgId) });
            await batch.commit();
            alert("Anggota berhasil ditambahkan!");
        } else {
            await updateDoc(doc(db, "organizations", orgId, "members", this.memberForm.uid), { role_name: this.memberForm.role });
            alert("Perubahan role berhasil disimpan!");
        }
        this.showMemberModal = false;
    },

    async removeMember() {
        if(!confirm("Yakin ingin mengeluarkan anggota ini?")) return;
        const orgId = this.activeOrg.id; const targetUid = this.memberForm.uid;
        const batch = writeBatch(db);
        batch.delete(doc(db, "organizations", orgId, "members", targetUid));
        batch.update(doc(db, "users", targetUid), { joined_organizations: arrayRemove(orgId) });
        await batch.commit(); alert("Anggota berhasil dikeluarkan.");
        this.showMemberModal = false;
    },

    listenToPermissions(uid, orgId) {
        this.unsubPerms = onSnapshot(doc(db, 'organizations', orgId, 'members', uid), (docSnap) => {
            if (docSnap.exists()) this.permissions = docSnap.data().permissions;
        });
    },

    copyOrgId() { navigator.clipboard.writeText(this.activeOrg.id).then(() => { alert("Organization ID disalin: " + this.activeOrg.id); }); },
    
    async logout() {
        if (confirm("Are you sure you want to logout?")) {
            try { await signOut(auth); localStorage.removeItem('last_active_tab'); localStorage.removeItem('last_active_org'); window.location.reload(); } catch (error) { alert("Logout failed!"); }
        }
    },
    
    switchTab(tabName) { this.activeTab = tabName; localStorage.setItem('last_active_tab', tabName); },
    
    // --- HELPER UNTUK NAMA CHAT YANG DINAMIS ---
    getMemberName(uid) {
        const member = this.members.find(m => m.uid === uid);
        return member ? (member.name || member.short_id || "Member") : "Member";
    },

    getPageTitle() { return this.activeTab === 'chat' ? this.activeOrg.name : 'SYNORA'; },
    formatCurrency(value) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value || 0); },
    formatTime(ts) {
        if (!ts) return ''; 
        const date = ts.toDate ? ts.toDate() : new Date();
        return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
    },
    formatDate(ts) {
        if (!ts) return '';
        const date = ts.toDate ? ts.toDate() : new Date();
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ' + date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
    }
}));

window.Alpine = Alpine;
Alpine.start();
