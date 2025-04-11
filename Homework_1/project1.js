// bgImg is the background image to be modified.
// fgImg is the foreground image.
// fgOpac is the opacity of the foreground image.
// fgPos is the position of the foreground image in pixels. It can be negative and (0,0) means the top-left pixels of the foreground and background are aligned.
function composite( bgImg, fgImg, fgOpac, fgPos )
{   const backgroundWidth = bgImg.width;
    const foregroundWidth = fgImg.width;

    for (let y = 0; y < fgImg.height; y++) {
        const targetBgY = y + fgPos.y;
        if (targetBgY < 0 || targetBgY >= bgImg.height) continue;

        for (let x = 0; x < fgImg.width; x++) {
            const targetBgX = x + fgPos.x;
            if (targetBgX < 0 || targetBgX >= backgroundWidth) continue;

            const foregroundIndex = (y * foregroundWidth + x) * 4;
            const backgroundIndex = (targetBgY * backgroundWidth + targetBgX) * 4;

            const foregroundAlpha = (fgImg.data[foregroundIndex + 3] / 255) * fgOpac;
            const backgroundWeight = 1 - foregroundAlpha;

            for (let channel = 0; channel < 3; channel++) {
                const fgValue = fgImg.data[foregroundIndex + channel];
                const bgValue = bgImg.data[backgroundIndex + channel];
                const blendedValue = Math.round(fgValue * foregroundAlpha + bgValue * backgroundWeight);
                bgImg.data[backgroundIndex + channel] = blendedValue;
            }
        }
    }
}
