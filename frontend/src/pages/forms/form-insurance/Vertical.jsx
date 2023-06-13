import React, { useState, useEffect } from "react";
import Textinput from "@/components/ui/Textinput";
import InputGroup from "@/components/ui/InputGroup";
import Textarea from "@/components/ui/Textarea";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Icon from "@/components/ui/Icon";
import { useForm } from "react-hook-form";
import Select from "@/components/ui/Select";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useAccount, useContract, useNetwork, useSigner } from "wagmi";
import EarthRegistrarControllerABI from "./EarthRegistrarControllerABI.json";
import { ethers } from "ethers";
import { useNavigate } from "react-router-dom";

const steps = [
  {
    id: 1,
    title: "DID Linkage",
  },
  {
    id: 2,
    title: "Company Goal",
  },
  {
    id: 3,
    title: "CRCs Premium",
  },
  {
    id: 4,
    title: "Payment",
  },
];

let stepSchema = yup.object().shape({
  username: yup.string().required("Domain is required"),
  fullname: yup.string().required("Company name is required"),
  email: yup.string().email("Email is not valid").required("Email is required")
});

let personalSchema = yup.object().shape({
  ton: yup.string().required("Carbon removal target is required"),
});
let addressSchema = yup.object().shape({
});

let socialSchema = yup.object().shape({
  amount: yup
    .number()
    .required("Make a Payment")
});
const FormWizard = () => {
  const navigate = useNavigate();
  const { data: signer } = useSigner();
  const { address } = useAccount();
  const { chain } = useNetwork();
  
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

  const token = useContract({
    address: '0xee67711641cD4518704DbEB255E03D93800E8CCa',
    abi: [
      {
        "inputs": [
          {
            "internalType": "address",
            "name": "spender",
            "type": "address"
          },
          {
            "internalType": "uint256",
            "name": "amount",
            "type": "uint256"
          }
        ],
        "name": "approve",
        "outputs": [
          {
            "internalType": "bool",
            "name": "",
            "type": "bool"
          }
        ],
        "stateMutability": "nonpayable",
        "type": "function"
      }
    ],
    signerOrProvider: signer,
  })

  const registrar = useContract({
    address: '0xB1cF7dEA2CAaa01de6A67A78d0BEE06C8d20a0bD',
    abi: EarthRegistrarControllerABI,
    signerOrProvider: signer,
  })

  const [loading, setLoading] = useState(false)

  const onSubmit = async (data) => {
    // next step until last step . if last step then submit form
    let totalSteps = steps.length;
    const isLastStep = stepNumber === totalSteps - 1;
    if (isLastStep) {
      console.log(data);

      try {
        setLoading(true)

        // console.log('Something')
        const domainName = data.username.split('.')[0]
        const yourNode = ethers.utils.solidityKeccak256(['bytes32', 'bytes32'],  ['0xf26e227cc695ab105ff1dd76fedea7a6fb88274144cc3afa6533ec7d7151b22a', ethers.utils.keccak256(ethers.utils.toUtf8Bytes(domainName))])
        const partnerNode = '0x55ff964ed6f40299c384878cec0900fb91fc539607597c27a560eb1ba04419b5'

        const subname = domainName + "-" + data.partnerName.split(' ')[0] + "-" + Math.floor(Math.random() * 1000000).toString().padStart(6, '0')

        await (await token.approve('0xB1cF7dEA2CAaa01de6A67A78d0BEE06C8d20a0bD', ethers.utils.parseEther(data.amount.toString()), { gasLimit: 400000 })).wait()
        await (await registrar.buyInsurance(
          yourNode,
          partnerNode,
          subname,
          data.ton,
          ethers.utils.parseEther(data.amount.toString()),
          { gasLimit: 400000 }
        )).wait()

        const domainList = window.localStorage.getItem('838EARTH_INSURANCE_' + chain.id + "_" + address) ? JSON.parse(window.localStorage.getItem('838EARTH_INSURANCE_' + chain.id + "_" + address)) : [];
        domainList.push({
          ...data,
          domainName: subname + '.' + domainName,
        })
        window.localStorage.setItem('838EARTH_INSURANCE_' + chain.id + "_" + address, JSON.stringify(domainList))

        navigate('/crm')
      } catch (err) {
        console.error(err)
        window.alert("Buy failed")
      } finally {
        setLoading(false)
      }
    } else {
      setStepNumber(stepNumber + 1);
    }
  };

  const handlePrev = () => {
    setStepNumber(stepNumber - 1);
  };

  return (
    <div>
      <Card title="Get CRCs Insurance">
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
                        Link Your Company Profile
                      </h4>
                    </div>
                    <Textinput
                      label="Company Identity (Domain)"
                      type="text"
                      placeholder="0xCompany.Earth"
                      name="username"
                      error={errors.username}
                      register={register}
                    />
                    <Textinput
                      label="Company Name"
                      type="text"
                      placeholder="Company Name"
                      name="fullname"
                      error={errors.fullname}
                      register={register}
                    />
                    <Textinput
                      label="Email"
                      type="email"
                      placeholder="Type your email"
                      name="email"
                      error={errors.email}
                      register={register}
                    />
                  </div>
                </div>
              )}

              {stepNumber === 1 && (
                <div>
                  <div className="grid md:grid-cols-2 grid-cols-1 gap-5">
                    <div className="md:col-span-2 col-span-1">
                      <h4 className="text-base text-slate-800 dark:text-slate-300 mb-6">
                        Set Company Carbon Removal Goal
                      </h4>
                    </div>
                    <Textinput
                      label="Carbon Removal Target (kg)"
                      type="text"
                      placeholder="Enter your goal in Kg"
                      name="ton"
                      error={errors.ton}
                      register={register}
                    />
                    <Select
                      options={["2025", "2030", "2040","2050"]}
                      name="year"
                      label="Target Phase (Year)"
                      register={register}
                    />
                    <Textinput
                      label="Suggested Solution"
                      type="text"
                      placeholder="Nature-Based Solution"
                      name="lname"
                      register={register}
                      readonly
                    />
                    <Select
                      options={["Aff_0x41234 (Rate 8.9)", "Aff_0x88322 (Rate 9.2)", "Hybrid_0x86768 (Rate 9.7)","Tech_0x42349 (Rate 7.4)"]}
                      name="partnerName"
                      label="Select Service Provider"
                      register={register}
                    />
                  </div>
                </div>
              )}
              {stepNumber === 2 && (
                <div>
                  <div className="grid md:grid-cols-2 grid-cols-1 gap-5">
                    <div className="md:col-span-2 col-span-1">
                      <h4 className="text-base text-slate-800 dark:text-slate-300 mb-6">
                        Carbon Credit Removal Insurance Premium
                      </h4>
                    </div>
                    <Textinput
                      label="Selected Focused Solution"
                      id="pn3"
                      type="text"
                      placeholder="Nature-Based: Afforestation by Aff_0x41234 (Rate 8.9) "
                      register={register}
                    />
                    <Textinput
                      label="Cost"
                      id="pn4"
                      readonly
                      type="text"
                      placeholder="$10,000 (7 years)"
                      register={register}
                    />
                    <Textinput
                      label="CRCs Insurance Coverage"
                      id="pn5"
                      type="text"
                      placeholder="Up to $50,000"
                      register={register}
                    />
                    <Textinput
                      label="Calculated Premium Cost"
                      id="pn2"
                      readonly
                      type="text"
                      placeholder="$1,500 per year"
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
                        Get Coverage Now
                      </h4>
                    </div>
                    <Textinput
                      label="Make a payment"
                      type="text"
                      placeholder="Amount"
                      name="amount"
                      error={errors.amount}
                      register={register}
                      disabled={loading}
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
                    disabled={loading}
                  />
                )}
                <Button
                  text={stepNumber !== steps.length - 1 ? "next" : "submit"}
                  className="btn-dark"
                  type="submit"
                  disabled={loading}
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
