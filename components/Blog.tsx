import React from 'react';
import BackButton from './BackButton';

interface BlogProps {
    onBackToMenu: () => void;
}

const Blog: React.FC<BlogProps> = ({ onBackToMenu }) => {
    return (
        <div className="container py-5 position-relative">
            <BackButton onClick={onBackToMenu} />
            <div className="text-center mb-5">
                <h2 className="display-5 fw-bold text-white">Blog NkGame</h2>
                <p className="text-muted fs-5">Pembaruan, berita, dan pemikiran dari tim.</p>
            </div>
            
            <div className="row justify-content-center g-4">
                <div className="col-lg-8">
                     <div className="card bg-secondary text-light shadow">
                        <div className="card-body">
                            <h3 className="card-title text-info">Selamat Datang di NkGame!</h3>
                            <p className="card-text">Kami sangat senang meluncurkan Koleksi Game NkGame! Platform ini lahir dari kecintaan pada game papan klasik dan keinginan untuk menciptakan ruang di mana teman dan keluarga dapat terhubung dan bermain, baik saat mereka duduk bersebelahan atau terpisah ribuan mil. Tujuan kami adalah untuk menawarkan pengalaman bermain game yang lancar, menyenangkan, dan dapat diakses oleh semua orang.</p>
                            <p className="card-text">Saat ini, kami menawarkan Tic-Tac-Toe, Gobblet Gobblers, Catur, dan Connect 4, dengan lebih banyak game yang sedang dalam pengembangan. Jelajahi, tantang temanmu, dan yang paling penting, bersenang-senanglah!</p>
                            <p className="card-text"><small className="text-muted">Diposting pada 1 Juli 2024</small></p>
                        </div>
                    </div>
                </div>

                <div className="col-lg-8">
                     <div className="card bg-secondary text-light shadow">
                        <div className="card-body">
                            <h3 className="card-title text-info">Apa Selanjutnya: Rencana Masa Depan</h3>
                            <p className="card-text">Peluncuran ini hanyalah permulaan. Kami memiliki banyak ide menarik untuk masa depan NkGame! Rencana kami mencakup penambahan lebih banyak game klasik, memperkenalkan fitur-fitur seperti profil pemain yang dapat disesuaikan, papan peringkat, dan turnamen. Kami juga terus bekerja untuk meningkatkan fungsionalitas online agar lebih stabil dan kaya fitur.</p>
                            <p className="card-text">Masukan Anda sangat berharga bagi kami. Jika Anda memiliki saran game atau fitur yang ingin Anda lihat, jangan ragu untuk menghubungi kami melalui WhatsApp. Terima kasih telah menjadi bagian dari komunitas kami!</p>
                            <p className="card-text"><small className="text-muted">Diposting pada 15 Juli 2024</small></p>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default Blog;
