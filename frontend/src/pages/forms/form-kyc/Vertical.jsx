import React, { useState, useEffect } from "react";
import Textinput from "@/components/ui/Textinput";
import InputGroup from "@/components/ui/InputGroup";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { useForm } from "react-hook-form";
import Fileinput from "@/components/ui/Fileinput";
import { yupResolver } from "@hookform/resolvers/yup";
import Select from "@/components/ui/Select";
import * as yup from "yup";
import { useAccount, useContract, useContractWrite, useNetwork, usePrepareContractWrite, useSigner } from "wagmi";
import EarthRegistrarControllerABI from "./EarthRegistrarControllerABI.json"
import { useNavigate } from "react-router-dom";

const steps = [
  {
    id: 1,
    title: "Company Profile",
  },
  {
    id: 2,
    title: "Current Emission",
  },
  {
    id: 3,
    title: "Focused Solution",
  },
  {
    id: 4,
    title: "Domain Generation",
  },
];

let stepSchema = yup.object().shape({
  username: yup.string().required("Company Name is required"),
  fullname: yup.string().required("Location is required"),
  email: yup.string().email("Email is not valid").required("Email is required")
});

let personalSchema = yup.object().shape({
  fname: yup.string().required(" Carbon emission is required"),
  // cname: yup.string().required(" Carbon emission is required"),
  // lname: yup.string().required(" Last name is required"),
});
let addressSchema = yup.object().shape({
  address: yup.string().required(" Solution Detail is required"),
});
// const url =
//   /^((ftp|http|https):\/\/)?(www.)?(?!.*(ftp|http|https|www.))[a-zA-Z0-9_-]+(\.[a-zA-Z]+)+((\/)[\w#]+)*(\/\w+\?[a-zA-Z0-9_]+=\w+(&[a-zA-Z0-9_]+=\w+)*)?$/gm;

let socialSchema = yup.object().shape({
  domainName: yup
    .string()
    .required("Domain Name is required")
    // .matches(url, "Domain Name is required"),
});
const FormWizard = () => {
  const { address } = useAccount()
  const { data: signer } = useSigner()
  const { chain } = useNetwork()
  const navigate = useNavigate()

  const [stepNumber, setStepNumber] = useState(0);

  // find current step schema
  let currentStepSchema;
  switch (stepNumber) {
    case 0:
      currentStepSchema = stepSchema;
      break;
    case 1:
      currentStepSchema = personalSchema;
      break;
    case 2:
      currentStepSchema = addressSchema;
      break;
    case 3:
      currentStepSchema = socialSchema;
      break;
    default:
      currentStepSchema = stepSchema;
  }
  useEffect(() => {
    // console.log("step number changed");
  }, [stepNumber]);

  const {
    register,
    formState: { errors },
    handleSubmit,
    watch,
  } = useForm({
    resolver: yupResolver(currentStepSchema),
    // keep watch on all fields
    mode: "all",
  });

  const registrar = useContract({
    address: '0xB1cF7dEA2CAaa01de6A67A78d0BEE06C8d20a0bD',
    abi: EarthRegistrarControllerABI,
    signerOrProvider: signer,
  })

  const [minting, setMinting] = useState(false)

  const onSubmit = async (data) => {
    // next step until last step . if last step then submit form
    let totalSteps = steps.length;
    const isLastStep = stepNumber === totalSteps - 1;
    console.log(data, stepNumber, totalSteps)
    if (isLastStep) {
      try {
        console.log(data);

        const domainName = data.domainName

        setMinting(true)
      
        const tx = await registrar.register(
          domainName.split('.')[0],
          address,
          Math.floor(Date.now() / 1000) + 31536000,
          "0x" + "1234".padStart(64, "0"),
          "0x",
          { gasLimit: 400000 }
        )
  
        await tx.wait()

        const domainList = window.localStorage.getItem('838EARTH_DOMAINS_' + chain.id + "_" + address) ? JSON.parse(window.localStorage.getItem('838EARTH_DOMAINS_' + chain.id + "_" + address)) : [];
        domainList.push({
          companyName: data.username,
          ...data,
          domainName: domainName.split('.')[0],
        })
        window.localStorage.setItem('838EARTH_DOMAINS_' + chain.id + "_" + address, JSON.stringify(domainList))

        navigate('/crm')
      } catch (err) {
        console.error(err)
        window.alert("Mint failed. Please try again")
      } finally {
        setMinting(false)
      }
    } else {
      setStepNumber(stepNumber + 1);
    }
  };

  const handlePrev = () => {
    setStepNumber(stepNumber - 1);
  };

  const [selectedFile, setSelectedFile] = useState()

  return (
    <div>
      <Card title="KYB Form">
        <div className="grid gap-5 grid-cols-12">
          <div className="lg:col-span-3 col-span-12">
            <div className="flex z-[5] items-start relative flex-col lg:min-h-full md:min-h-[300px] min-h-[250px]">
              {steps.map((item, i) => (
                <div className="relative z-[1] flex-1 last:flex-none" key={i}>
                  <div
                    className={`   ${
                      stepNumber >= i
                        ? "bg-slate-900 text-white ring-slate-900 dark:bg-slate-900 dark:ring-slate-700  dark:ring-offset-slate-500 ring-offset-2"
                        : "bg-white ring-slate-900 ring-opacity-70  text-slate-900 dark:text-slate-300 text-opacity-70 dark:bg-slate-700 dark:ring-slate-700"
                    } 
            transition duration-150 icon-box md:h-12 md:w-12 h-8 w-8 rounded-full flex flex-col items-center justify-center relative z-[66] ring-1 md:text-lg text-base font-medium
            `}
                  >
                    {stepNumber <= i ? (
                      <span> {i + 1}</span>
                    ) : (
                      <span className="text-3xl">
                        <Icon icon="bx:check-double" />
                      </span>
                    )}
                  </div>

                  <div
                    className={` ${
                      stepNumber >= i
                        ? "bg-slate-900 dark:bg-slate-900"
                        : "bg-[#E0EAFF] dark:bg-slate-600"
                    } absolute top-0 left-1/2 -translate-x-1/2 h-full w-[2px]`}
                  ></div>
                  <div
                    className={` ${
                      stepNumber >= i
                        ? " text-slate-900 dark:text-slate-300"
                        : "text-slate-500 dark:text-slate-300 dark:text-opacity-40"
                    } absolute top-0 ltr:left-full rtl:right-full ltr:pl-4 rtl:pr-4 text-base leading-6 md:mt-3 mt-1 transition duration-150 w-full`}
                  >
                    <span className="w-max block">{item.title}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="conten-box lg:col-span-9 col-span-12">
            <form onSubmit={handleSubmit(onSubmit)}>
              {stepNumber === 0 && (
                <div>
                  <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 gap-5">
                    <div className="lg:col-span-3 md:col-span-2 col-span-1">
                      <h4 className="text-base text-slate-800 dark:text-slate-300 mb-6">
                        Enter Your Company Profile
                      </h4>
                    </div>
                    <Textinput
                      label="Company Name"
                      type="text"
                      placeholder="Type your Company Name"
                      name="username"
                      error={errors.username}
                      register={register}
                    />
                    <Textinput
                      label="Location"
                      type="text"
                      placeholder="Bangkok, Thailand"
                      name="fullname"
                      error={errors.fullname}
                      register={register}
                    />
                    <Textinput
                      label="Corporate Email"
                      type="email"
                      placeholder="Type your corporate email"
                      name="email"
                      error={errors.email}
                      register={register}
                    />
                    <Select
                      options={["Automobile", "Energy", "Miner", "Electrical", "Manufacturing", "Construction", "Telecommunication"]}
                      label="Business Industry"
                    />
                    
                    <div>
                      <label className="block capitalize form-label">Upload Document</label>

                      <Fileinput
                        name="basic"
                        selectedFile={selectedFile}
                        onChange={e => setSelectedFile(e.target.files[0])}
                      />
                    </div>
                  </div>
                </div>
              )}

              {stepNumber === 1 && (
                <div>
                  <div className="grid md:grid-cols-2 grid-cols-1 gap-5">
                    <div className="md:col-span-2 col-span-1">
                      <h4 className="text-base text-slate-800 dark:text-slate-300 mb-6">
                        Enter Your Carbon Emission
                      </h4>
                    </div>
                    <Textinput
                      label="Current Carbon Emission (kg)"
                      type="text"
                      placeholder="Put amount in kg"
                      name="fname"
                      error={errors.fname}
                      register={register}
                    />
                    <Select
                      options={["Monthly", "Yearly", "Daily"]}
                      label="Period"
                    />
                  </div>
                </div>
              )}
              {stepNumber === 2 && (
                <div>
                  <div className="grid grid-cols-1 gap-5">
                    <div className="">
                      <h4 className="text-base text-slate-800 dark:text-slate-300 mb-6">
                        Specify your solution
                      </h4>
                    </div>
                    <Select
                      options={["Nature-Based Solution", "Hybrid Solution", "Technological Solution"]}
                      label="Method"
                    />
                    <Textarea
                      label="Details"
                      type="text"
                      placeholder=""
                      name="address"
                      error={errors.address}
                      register={register}
                    />
                  </div>
                </div>
              )}
              {stepNumber === 3 && (
                <div>
                  <div className="grid lg:grid-cols-3 md:grid-cols-2 grid-cols-1 gap-5">
                    <div className="lg:col-span-3 md:col-span-2 col-span-1">
                      <h4 className="text-base text-slate-800 dark:text-slate-300 mb-6">
                        Enter Your Digital Identity (DID)
                      </h4>
                    </div>
                    <Textinput
                      label="Domain Name (.Earth)"
                      type="text"
                      placeholder="CompanyName.Earth"
                      name="domainName"
                      error={errors.domainName}
                      register={register}
                      disabled={minting}
                    />
                  </div>
                </div>
              )}

              <div
                className={`${
                  stepNumber > 0 ? "flex justify-between" : " text-right"
                } mt-10`}
              >
                {stepNumber !== 0 && (
                  <Button
                    text="prev"
                    className="btn-dark"
                    onClick={handlePrev}
                    disabled={minting}
                  />
                )}
                <Button
                  text={stepNumber !== steps.length - 1 ? "next" : "submit"}
                  className="btn-dark"
                  type="submit"
                  disabled={minting}
                />
              </div>
            </form>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default FormWizard;
