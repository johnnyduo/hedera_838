import React from "react";
import Image from "@/components/ui/Image";
import Card from "@/components/ui/Card";

// Image Import
import image3 from "@/assets/images/all-img/renewable.jpg";

const PageIimage = () => {
  return (
    <div>
      <div className="space-y-5">
        <Card>
          <Image
            src={image3}
            alt="Small image with fluid-grow:"
            className="rounded-md w-full "
          />
        </Card>
      </div>
    </div>
  );
};

export default PageIimage;
