// document.addEventListener('DOMContentLoaded', () => {
//     const pages = document.querySelectorAll('.page');
//     let currentPage = 1;
//     let isAnimating = false;

//     function flipPage(direction) {
//         if (isAnimating) return;

//         isAnimating = true;
//         const current = document.querySelector(`.page[data-page="${currentPage}"]`);
//         if ((direction === 'next' && currentPage < pages.length) || (direction === 'prev' && currentPage > 1)) {
//             if (direction === 'next' && currentPage < pages.length) currentPage++;
//             else if (direction === 'prev' && currentPage > 1) currentPage--;

//             const newPage = document.querySelector(`.page[data-page="${currentPage}"]`);
//             if (newPage) {
//                 newPage.style.zIndex = pages.length + 1;
//                 newPage.style.visibility = 'visible';
//                 newPage.classList.remove('flipped', direction === 'prev' ? 'next-page' : 'prev-page');
//                 newPage.classList.add(direction === 'next' ? 'next-page' : 'prev-page');

//                 requestAnimationFrame(() => {
//                     newPage.style.transform = 'rotateY(0deg)'; // Đặt lại transform để tránh xung đột
//                 });
//             }

//             if (current) {
//                 current.classList.add('flipped');
//                 const handleAnimationEnd = () => {
//                     current.classList.remove('flipped', 'next-page', 'prev-page');
//                     current.style.zIndex = 0;
//                     current.style.visibility = 'hidden';
//                     current.removeEventListener('animationend', handleAnimationEnd);
//                     isAnimating = false;
//                 };
//                 current.addEventListener('animationend', handleAnimationEnd);
//             }
//         } else {
//             isAnimating = false;
//         }
//     }

//     document.querySelectorAll('.next').forEach(button => {
//         button.addEventListener('click', () => flipPage('next'));
//     });

//     document.querySelectorAll('.prev').forEach(button => {
//         button.addEventListener('click', () => flipPage('prev'));
//     });

//     // Khởi tạo trang đầu tiên
//     const firstPage = document.querySelector(`.page[data-page="1"]`);
//     firstPage.classList.add('next-page');
//     firstPage.style.zIndex = pages.length + 1;
//     firstPage.style.visibility = 'visible';
//     pages.forEach((page, index) => {
//         if (index > 0) {
//             page.classList.add('flipped');
//             page.style.zIndex = pages.length - index;
//             page.style.visibility = 'hidden';
//         }
//     });
// });

document.addEventListener('DOMContentLoaded', () => {
    const pages = document.querySelectorAll('.page');
    let currentPage = 1;

    function flipPage(direction) {
        const current = document.querySelector(`.page[data-page="${currentPage}"]`);
        const isNext = direction === 'next';
        if ((isNext && currentPage < pages.length) || (!isNext && currentPage > 1)) {
            const newPageNum = isNext ? currentPage + 1 : currentPage - 1;
            const newPage = document.querySelector(`.page[data-page="${newPageNum}"]`);

            if (newPage) {
                // Bắt đầu animation
                current.classList.remove('active');
                current.classList.add(isNext ? 'flipping-next' : 'flipping-prev');
                newPage.classList.remove('flipping-next', 'flipping-prev');
                newPage.classList.add('active');

                // Cập nhật currentPage sau khi animation bắt đầu
                currentPage = newPageNum;

                // Xử lý sau khi animation kết thúc
                const handleTransitionEnd = (e) => {
                    if (e.propertyName === 'transform') {
                        current.classList.remove('flipping-next', 'flipping-prev');
                        current.style.visibility = 'hidden';
                        current.removeEventListener('transitionend', handleTransitionEnd);
                    }
                };
                current.addEventListener('transitionend', handleTransitionEnd);
            }
        }
    }

    document.querySelectorAll('.next').forEach(button => {
        button.addEventListener('click', () => flipPage('next'));
    });

    document.querySelectorAll('.prev').forEach(button => {
        button.addEventListener('click', () => flipPage('prev'));
    });

    // Khởi tạo trang đầu tiên
    const firstPage = document.querySelector(`.page[data-page="1"]`);
    firstPage.classList.add('active');
    firstPage.style.visibility = 'visible';
    pages.forEach((page, index) => {
        if (index > 0) {
            page.style.visibility = 'hidden';
        }
    });
});